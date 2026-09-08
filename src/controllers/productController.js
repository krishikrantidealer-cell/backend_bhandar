const Product = require("../models/Product");
const mongoose = require("mongoose");

// Helper to determine sort object
function getSortCriteria(sortParam) {
    switch (sortParam) {
        case "price_asc":
            return { "variants.0.price": 1, importedAt: -1 };
        case "price_desc":
            return { "variants.0.price": -1, importedAt: -1 };
        case "title_asc":
            return { title: 1 };
        case "title_desc":
            return { title: -1 };
        case "oldest":
            return { importedAt: 1, createdAt: 1 };
        case "newest":
        default:
            return { importedAt: -1, createdAt: -1 };
    }
}

// GET /api/products
// Query params: ?page=1&limit=20&category=<id>&search=<text>&status=active&sort=price_asc|price_desc|newest|title_asc
const getAllProducts = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, search, status, buy1get1, sort } = req.query;

        const filter = {};
        if (category) {
            filter.categoryIds = category;
        }
        if (status) filter.status = status;
        if (buy1get1 === "true") {
            filter.buy1get1 = true;
        } else if (buy1get1 === "false") {
            filter.buy1get1 = false;
        }

        if (search) {
            const cleanSearch = search.trim();
            filter.$or = [
                { title: { $regex: cleanSearch, $options: "i" } },
                { vendor: { $regex: cleanSearch, $options: "i" } },
                { "variants.sku": { $regex: cleanSearch, $options: "i" } }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const sortCriteria = getSortCriteria(sort);

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("categoryIds", "name")
                .sort(sortCriteria)
                .skip(skip)
                .limit(Number(limit))
                .select("-bodyHtml"),
            Product.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: products
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/products/:handle
const getProductByHandle = async (req, res) => {
    try {
        let query = { handle: req.params.handle };
        if (mongoose.Types.ObjectId.isValid(req.params.handle)) {
            query = { _id: req.params.handle };
        }
        const product = await Product.findOne(query)
            .populate("categoryIds", "name");

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/products/category/:categoryId
const getProductsByCategory = async (req, res) => {
    try {
        const { page = 1, limit = 20, sort } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const sortCriteria = getSortCriteria(sort);

        const filter = { categoryIds: req.params.categoryId };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("categoryIds", "name")
                .sort(sortCriteria)
                .skip(skip)
                .limit(Number(limit))
                .select("-bodyHtml"),
            Product.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: products
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getAllProducts, getProductByHandle, getProductsByCategory };
