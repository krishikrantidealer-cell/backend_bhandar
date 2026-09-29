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
        const { page = 1, limit = 50, category, categoryId, collection, collectionId, search, status, buy1get1, sort } = req.query;

        const filter = {};
        const conditions = [];

        const rawCat = (req.params.categoryId || category || categoryId || collection || collectionId || "").toString().trim();
        if (rawCat) {
            const catConditions = [];

            // Special Handling: Buy 1 Get 1
            if (/^(buy[-_ ]?1[-_ ]?get[-_ ]?1|bogo)$/i.test(rawCat)) {
                catConditions.push({ buy1get1: true });
                catConditions.push({ assignedCollections: /buy 1 get 1|bogo/i });
                catConditions.push({ title: /1\+1 free|buy 1 get 1|1\+1/i });
            }
            // Special Handling: Best Sellers
            else if (/^best[-_ ]?sellers?$/i.test(rawCat)) {
                catConditions.push({ assignedCollections: /best[-_ ]?sellers?/i });
                catConditions.push({ tags: /best[-_ ]?sellers?|bestseller|featured/i });
            } else {
                const resolvedCatIds = [];
                if (mongoose.Types.ObjectId.isValid(rawCat)) {
                    resolvedCatIds.push(new mongoose.Types.ObjectId(rawCat));
                }

                // Check Category
                const catDoc = await Category.findOne({
                    $or: [
                        { _id: mongoose.Types.ObjectId.isValid(rawCat) ? new mongoose.Types.ObjectId(rawCat) : null },
                        { slug: rawCat },
                        { slug: new RegExp(`^${rawCat}$`, "i") },
                        { name: new RegExp(`^${rawCat}$`, "i") },
                        { title: new RegExp(`^${rawCat}$`, "i") }
                    ].filter(q => q._id !== null)
                }).lean();

                if (catDoc && !resolvedCatIds.some(id => id.toString() === catDoc._id.toString())) {
                    resolvedCatIds.push(catDoc._id);
                }

                if (resolvedCatIds.length > 0) {
                    catConditions.push({ categoryId: { $in: resolvedCatIds } });
                    catConditions.push({ categoryIds: { $in: resolvedCatIds } });
                }

                // Check Collection
                const colDoc = await Collection.findOne({
                    $or: [
                        { _id: mongoose.Types.ObjectId.isValid(rawCat) ? new mongoose.Types.ObjectId(rawCat) : null },
                        { slug: rawCat },
                        { slug: new RegExp(`^${rawCat}$`, "i") },
                        { name: new RegExp(`^${rawCat}$`, "i") }
                    ].filter(q => q._id !== null)
                }).lean();

                if (colDoc) {
                    catConditions.push({ assignedCollections: colDoc.name });
                    catConditions.push({ assignedCollections: new RegExp(`^${colDoc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
                    if (colDoc.slug) {
                        catConditions.push({ assignedCollections: colDoc.slug });
                        catConditions.push({ assignedCollections: new RegExp(`^${colDoc.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") });
                    }
                    catConditions.push({ assignedCollections: colDoc._id.toString() });

                    if (/best[-_ ]?sellers?/i.test(colDoc.name) || /best[-_ ]?sellers?/i.test(colDoc.slug)) {
                        catConditions.push({ assignedCollections: /best[-_ ]?sellers?/i });
                        catConditions.push({ tags: /best[-_ ]?sellers?|bestseller/i });
                    }
                    if (/buy[-_ ]?1[-_ ]?get[-_ ]?1|bogo/i.test(colDoc.name) || /buy[-_ ]?1[-_ ]?get[-_ ]?1|bogo/i.test(colDoc.slug)) {
                        catConditions.push({ buy1get1: true });
                        catConditions.push({ title: /1\+1 free|buy 1 get 1|1\+1/i });
                    }
                }

                const spaceCat = rawCat.replace(/[-_]/g, " ");
                const escapedRaw = rawCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escapedSpace = spaceCat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                catConditions.push({ assignedCollections: new RegExp(`^${escapedRaw}$`, "i") });
                catConditions.push({ assignedCollections: new RegExp(`^${escapedSpace}$`, "i") });
                catConditions.push({ category: new RegExp(`^${escapedRaw}$`, "i") });
                catConditions.push({ category: new RegExp(`^${escapedSpace}$`, "i") });
                catConditions.push({ tags: new RegExp(`^${escapedRaw}$`, "i") });
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
            if (cleanSearch) {
                const escapedSearch = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const words = cleanSearch.split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                const wordRegexList = words.map(w => ({ title: { $regex: w, $options: "i" } }));

                const searchOr = [
                    { title: { $regex: escapedSearch, $options: "i" } },
                    { vendor: { $regex: escapedSearch, $options: "i" } },
                    { brand: { $regex: escapedSearch, $options: "i" } },
                    { tags: { $regex: escapedSearch, $options: "i" } },
                    { category: { $regex: escapedSearch, $options: "i" } },
                    { assignedCollections: { $regex: escapedSearch, $options: "i" } },
                    { "variants.sku": { $regex: escapedSearch, $options: "i" } },
                    { "variants.title": { $regex: escapedSearch, $options: "i" } }
                ];

                if (wordRegexList.length > 1) {
                    searchOr.push({ $and: wordRegexList });
                }

                conditions.push({ $or: searchOr });
            }
        }

        if (conditions.length > 0) {
            filter.$and = conditions;
        }

        const skip = (Number(page) - 1) * Number(limit);
        const sortCriteria = getSortCriteria(sort);

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("categoryId", "name title slug")
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
            .populate("categoryId", "name title slug")
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
        const data = { ...req.body };
        delete data._id;
        delete data.id;

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
        } else {
            variants = variants.map(v => {
                const vObj = { ...v };
                if (vObj._id && !mongoose.Types.ObjectId.isValid(vObj._id)) delete vObj._id;
                if (vObj.id && !mongoose.Types.ObjectId.isValid(vObj.id)) delete vObj.id;
                return vObj;
            });
        }

        // Normalize images
        let images = [];
        if (Array.isArray(data.images)) {
            images = data.images.map(img => {
                if (typeof img === "string") {
                    return { original: img, medium: img, low: img };
                }
                if (img && typeof img === "object") {
                    const url = img.original || img.medium || img.low || img.src || img.url || "";
                    return { original: url, medium: img.medium || url, low: img.low || url };
                }
                return { original: "", medium: "", low: "" };
            }).filter(img => img.original && img.original.trim().length > 0);
        } else if (data.image) {
            const imgUrl = typeof data.image === "string" ? data.image : (data.image.original || data.image.url || "");
            if (imgUrl) images.push({ original: imgUrl, medium: imgUrl, low: imgUrl });
        } else if (data.imageUrl) {
            images.push({ original: data.imageUrl, medium: data.imageUrl, low: data.imageUrl });
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
        console.error("❌ createProduct error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/products/:id (Admin Only)
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };

        delete data._id;
        delete data.id;

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

        // Clean variants
        if (Array.isArray(data.variants)) {
            data.variants = data.variants.map(v => {
                const vObj = { ...v };
                if (vObj._id && !mongoose.Types.ObjectId.isValid(vObj._id)) delete vObj._id;
                if (vObj.id && !mongoose.Types.ObjectId.isValid(vObj.id)) delete vObj.id;
                return vObj;
            });
        }

        // Normalize images
        if (data.images && Array.isArray(data.images)) {
            data.images = data.images.map(img => {
                if (typeof img === "string") {
                    return { original: img, medium: img, low: img };
                }
                if (img && typeof img === "object") {
                    const url = img.original || img.medium || img.low || img.src || img.url || "";
                    return { original: url, medium: img.medium || url, low: img.low || url };
                }
                return { original: "", medium: "", low: "" };
            }).filter(img => img.original && img.original.trim().length > 0);
        } else if (data.image) {
            const imgUrl = typeof data.image === "string" ? data.image : (data.image.original || data.image.url || "");
            if (imgUrl) {
                data.images = [{ original: imgUrl, medium: imgUrl, low: imgUrl }];
            }
        // Normalize category and productType
        if (data.categoryId || data.category || data.categoryIds) {
            let catId = data.categoryId;
            let catIds = Array.isArray(data.categoryIds) ? [...data.categoryIds] : [];

            if (catId && mongoose.Types.ObjectId.isValid(catId)) {
                const catDoc = await Category.findById(catId);
                if (catDoc) {
                    data.productType = catDoc.name;
                    data.categoryId = catDoc._id;
                    if (!catIds.some(id => id.toString() === catDoc._id.toString())) {
                        catIds.push(catDoc._id);
                    }
                }
            } else if (data.category) {
                const catDoc = await Category.findOne({
                    $or: [
                        { _id: mongoose.Types.ObjectId.isValid(data.category) ? new mongoose.Types.ObjectId(data.category) : null },
                        { name: new RegExp(`^${String(data.category).trim()}$`, "i") },
                        { slug: new RegExp(`^${String(data.category).trim()}$`, "i") }
                    ].filter(q => q._id !== null)
                });
                if (catDoc) {
                    data.categoryId = catDoc._id;
                    data.productType = catDoc.name;
                    if (!catIds.some(id => id.toString() === catDoc._id.toString())) {
                        catIds.push(catDoc._id);
                    }
                }
            }

            if (catIds.length > 0) {
                data.categoryIds = catIds;
            }
        }

        // Clean assigned collections
        if (Array.isArray(data.assignedCollections)) {
            data.assignedCollections = data.assignedCollections
                .map(c => String(c).trim())
                .filter(Boolean);
        }

        const product = await Product.findOneAndUpdate(query, { $set: data }, { new: true, runValidators: true });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, product, data: product });
    } catch (error) {
        console.error("❌ updateProduct error:", error);
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
