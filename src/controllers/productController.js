const Product = require("../models/Product");

// GET /api/products
// Query params: ?page=1&limit=20&category=<id>&search=<text>&status=active
const getAllProducts = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, search, status } = req.query;

        const filter = {};
        if (category) filter.categoryIds = category;
        if (status) filter.status = status;
        if (search) filter.$text = { $search: search };

        const skip = (Number(page) - 1) * Number(limit);

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("categoryIds", "name")
                .sort({ importedAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select("-bodyHtml"),   // exclude heavy HTML from list view
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
        const product = await Product.findOne({ handle: req.params.handle })
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
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter = { categoryIds: req.params.categoryId };

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("categoryIds", "name")
                .sort({ importedAt: -1 })
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
