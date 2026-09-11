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

            const catConditions = [];
            if (resolvedIds.length > 0) {
                catConditions.push({ categoryId: { $in: resolvedIds } });
                catConditions.push({ categoryIds: { $in: resolvedIds } });
            }
            catConditions.push({ assignedCollections: new RegExp(`^${rawCat}$`, "i") });
            catConditions.push({ category: new RegExp(`^${rawCat}$`, "i") });

            conditions.push({ $or: catConditions });
        }

        if (collection) {
            conditions.push({
                $or: [
                    { assignedCollections: collection },
                    { assignedCollections: new RegExp(`^${collection}$`, "i") }
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

// GET /api/products/category/:categoryId
const getProductsByCategory = async (req, res) => {
    return getAllProducts(req, res);
};

module.exports = { getAllProducts, getProductByHandle, getProductsByCategory };
