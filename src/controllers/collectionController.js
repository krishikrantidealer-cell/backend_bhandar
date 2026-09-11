const Collection = require("../models/Collection");

// GET /api/collections
const getCollections = async (req, res) => {
    try {
        const collections = await Collection.find({ isActive: true }).sort({ priority: -1, name: 1 }).lean();
        res.json({
            success: true,
            count: collections.length,
            collections,
            data: collections
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/collections/:slug
const getCollectionBySlug = async (req, res) => {
    try {
        const cleanSlug = (req.params.slug || "").trim();
        const collection = await Collection.findOne({
            $or: [
                { slug: cleanSlug },
                { slug: new RegExp(`^${cleanSlug}$`, "i") },
                { name: new RegExp(`^${cleanSlug}$`, "i") }
            ]
        }).lean();

        if (!collection) {
            return res.status(404).json({ success: false, message: "Collection not found" });
        }
        res.json({ success: true, collection, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getCollections, getCollectionBySlug };
