const Product = require("../models/Product");
const Category = require("../models/Category");
const Collection = require("../models/Collection");
const mongoose = require("mongoose");

// Helper to determine sort object
function getSortCriteria(sortParam) {
    switch (sortParam) {
        case "price_asc":
            return { "variants.0.price": 1, importedAt: -1 };
        case "price_desc":
            return { "variants.0.price": -1, importedAt: -1 };
        case "title_asc":
        case "a-z":
            return { title: 1 };
        case "title_desc":
        case "z-a":
            return { title: -1 };
        case "oldest":
            return { importedAt: 1, createdAt: 1 };
        case "newest":
        default:
            return { importedAt: -1, createdAt: -1 };
    }
}

// GET /api/products
// Query params: ?page=1&limit=50&category=<id|slug|name>&collection=<name>&search=<text>&status=active&sort=...
const getAllProducts = async (req, res) => {
    try {
        const { page = 1, limit = 50, category, categoryId, collection, search, status, buy1get1, sort } = req.query;

        const filter = {};
        const conditions = [];

        const rawCat = (req.params.categoryId || category || categoryId || "").toString().trim();
        if (rawCat) {
            const catConditions = [];

            // Special Handling: Buy 1 Get 1
            if (/^buy[-_ ]?1[-_ ]?get[-_ ]?1$/i.test(rawCat)) {
                catConditions.push({ buy1get1: true });
                catConditions.push({ assignedCollections: "Buy 1 Get 1" });
                catConditions.push({ title: /1\+1 free|buy 1 get 1|1\+1/i });
            }
            // Special Handling: Best Sellers
            else if (/^best[-_ ]?sellers?$/i.test(rawCat)) {
                catConditions.push({ assignedCollections: /best sellers|bestseller/i });
                catConditions.push({ tags: /best seller|bestseller|featured/i });
                // If none explicitly tagged, match top products with rating or status active
                catConditions.push({ status: "active" });
            } else {
                const resolvedIds = [];
                if (mongoose.Types.ObjectId.isValid(rawCat)) {
                    resolvedIds.push(new mongoose.Types.ObjectId(rawCat));
                }

                const catDoc = await Category.findOne({
                    $or: [
                        { slug: rawCat },
                        { slug: new RegExp(`^${rawCat}$`, "i") },
                        { name: new RegExp(`^${rawCat}$`, "i") },
                        { title: new RegExp(`^${rawCat}$`, "i") }
                    ]
                }).lean();

                if (catDoc && !resolvedIds.some(id => id.toString() === catDoc._id.toString())) {
                    resolvedIds.push(catDoc._id);
                }

                if (resolvedIds.length > 0) {
                    catConditions.push({ categoryId: { $in: resolvedIds } });
                    catConditions.push({ categoryIds: { $in: resolvedIds } });
                }

                const spaceCat = rawCat.replace(/[-_]/g, " ");
                catConditions.push({ assignedCollections: new RegExp(`^${rawCat}$`, "i") });
                catConditions.push({ assignedCollections: new RegExp(`^${spaceCat}$`, "i") });
                catConditions.push({ category: new RegExp(`^${rawCat}$`, "i") });
                catConditions.push({ category: new RegExp(`^${spaceCat}$`, "i") });
            }

            if (catConditions.length > 0) {
                conditions.push({ $or: catConditions });
            }
        }

        if (collection) {
            const spaceCol = collection.replace(/[-_]/g, " ");
            conditions.push({
                $or: [
                    { assignedCollections: collection },
                    { assignedCollections: spaceCol },
                    { assignedCollections: new RegExp(`^${collection}$`, "i") },
                    { assignedCollections: new RegExp(`^${spaceCol}$`, "i") }
                ]
            });
        }

        if (status) conditions.push({ status });

        if (buy1get1 === "true") {
            conditions.push({
                $or: [
                    { buy1get1: true },
                    { assignedCollections: "Buy 1 Get 1" },
                    { title: /1\+1 free|buy 1 get 1|1\+1/i }
                ]
            });
        }

        if (search) {
            const cleanSearch = search.trim();
            conditions.push({
                $or: [
                    { title: { $regex: cleanSearch, $options: "i" } },
                    { vendor: { $regex: cleanSearch, $options: "i" } },
                    { tags: { $regex: cleanSearch, $options: "i" } },
                    { "variants.sku": { $regex: cleanSearch, $options: "i" } }
                ]
            });
        }

        if (conditions.length > 0) {
            filter.$and = conditions;
        }

        const skip = (Number(page) - 1) * Number(limit);
        const sortCriteria = getSortCriteria(sort);

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("categoryIds", "name title slug")
                .sort(sortCriteria)
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Product.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            products,
            data: products
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/products/category/:categoryId
const getProductsByCategory = getAllProducts;

// GET /api/products/:handle
const getProductByHandle = async (req, res) => {
    try {
        const handle = (req.params.handle || "").trim();
        let query = { handle };
        if (mongoose.Types.ObjectId.isValid(handle)) {
            query = { $or: [{ _id: new mongoose.Types.ObjectId(handle) }, { handle }] };
        }
        const product = await Product.findOne(query)
            .populate("categoryIds", "name title slug")
            .lean();

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        res.json({
            success: true,
            product,
            data: product
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/products (Admin Only)
const createProduct = async (req, res) => {
    try {
        const data = req.body;
        if (!data.title) {
            return res.status(400).json({ success: false, message: "Product title is required" });
        }

        // Generate handle if not provided
        let handle = data.handle || data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!handle) {
            handle = `product-${Date.now()}`;
        }

        // Ensure uniqueness of handle
        const existing = await Product.findOne({ handle });
        if (existing) {
            handle = `${handle}-${Date.now()}`;
        }

        // Normalize variants
        let variants = data.variants;
        if (!variants || !Array.isArray(variants) || variants.length === 0) {
            variants = [{
                sku: data.sku || `SKU-${Date.now()}`,
                title: data.variantTitle || "Default Title",
                price: (data.price !== undefined) ? data.price.toString() : "0",
                compareAtPrice: (data.mrp !== undefined || data.compareAtPrice !== undefined) ? (data.mrp || data.compareAtPrice).toString() : "0",
                stock: (data.stock !== undefined) ? data.stock.toString() : "0"
            }];
        }

        // Normalize images
        let images = data.images || [];
        if (Array.isArray(images)) {
            images = images.map(img => {
                if (typeof img === "string") {
                    return { original: img, medium: img, low: img };
                }
                return img;
            });
        }

        // Category resolution
        let categoryId = data.categoryId;
        let categoryIds = data.categoryIds || [];
        if (data.category && !categoryId) {
            const catDoc = await Category.findOne({
                $or: [{ name: data.category }, { slug: data.category }]
            });
            if (catDoc) {
                categoryId = catDoc._id;
                if (!categoryIds.includes(catDoc._id)) {
                    categoryIds.push(catDoc._id);
                }
            }
        }

        const product = new Product({
            handle,
            title: data.title,
            description: data.description || "",
            bodyHtml: data.bodyHtml || data.description || "",
            vendor: data.brand || data.vendor || "Krishi Bhandar",
            productType: data.category || data.productType || "",
            status: data.status || "active",
            tags: data.tags || [],
            categoryId: categoryId || undefined,
            categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
            assignedCollections: data.assignedCollections || [],
            variants,
            images,
            buy1get1: data.buy1get1 || false
        });

        await product.save();
        res.status(201).json({ success: true, product, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/products/:id (Admin Only)
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { handle: id };
        }

        if (data.price !== undefined || data.stock !== undefined || data.mrp !== undefined) {
            if (!data.variants || data.variants.length === 0) {
                data.variants = [{
                    sku: data.sku || `SKU-${Date.now()}`,
                    title: "Default Title",
                    price: (data.price !== undefined) ? data.price.toString() : "0",
                    compareAtPrice: (data.mrp !== undefined || data.compareAtPrice !== undefined) ? (data.mrp || data.compareAtPrice).toString() : "0",
                    stock: (data.stock !== undefined) ? data.stock.toString() : "0"
                }];
            }
        }

        if (data.images && Array.isArray(data.images)) {
            data.images = data.images.map(img => typeof img === "string" ? { original: img, medium: img, low: img } : img);
        }

        const product = await Product.findOneAndUpdate(query, { $set: data }, { new: true, runValidators: true });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, product, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/products/:id (Admin Only)
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { handle: id };
        }

        const product = await Product.findOneAndDelete(query);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, message: "Product deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllProducts,
    getProductByHandle,
    getProductsByCategory,
    createProduct,
    updateProduct,
    deleteProduct
};
