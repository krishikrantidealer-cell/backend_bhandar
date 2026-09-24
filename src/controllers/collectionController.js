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

// POST /api/collections (Admin Only)
const createCollection = async (req, res) => {
    try {
        const data = req.body;
        if (!data.name) {
            return res.status(400).json({ success: false, message: "Collection name is required" });
        }

        let slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const existing = await Collection.findOne({ slug });
        if (existing) {
            slug = `${slug}-${Date.now()}`;
        }

        let subCollections = data.subCollections || [];
        if (typeof subCollections === "string") {
            subCollections = subCollections
                .split(",")
                .map(s => s.trim())
                .filter(Boolean)
                .map(name => ({
                    name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    isActive: true
                }));
        } else if (Array.isArray(subCollections)) {
            subCollections = subCollections.map(s => {
                if (typeof s === "string") {
                    return {
                        name: s,
                        slug: s.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                        isActive: true
                    };
                }
                return s;
            });
        }

        const collection = new Collection({
            name: data.name,
            slug,
            description: data.description || "",
            bannerImage: data.bannerImage || "",
            bannerTitle: data.bannerTitle || data.name,
            isActive: data.isActive !== undefined ? data.isActive : true,
            priority: data.priority ? parseInt(data.priority, 10) : 0,
            subCollections
        });

        await collection.save();
        res.status(201).json({ success: true, collection, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/collections/:id (Admin Only)
const updateCollection = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        let query = {};
        const mongoose = require("mongoose");
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { slug: id };
        }

        if (data.subCollections && typeof data.subCollections === "string") {
            data.subCollections = data.subCollections
                .split(",")
                .map(s => s.trim())
                .filter(Boolean)
                .map(name => ({
                    name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                    isActive: true
                }));
        }

        const collection = await Collection.findOneAndUpdate(query, { $set: data }, { new: true, runValidators: true });
        if (!collection) {
            return res.status(404).json({ success: false, message: "Collection not found" });
        }

        res.json({ success: true, collection, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/collections/:id (Admin Only)
const deleteCollection = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};
        const mongoose = require("mongoose");
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { slug: id };
        }

        const collection = await Collection.findOneAndDelete(query);
        if (!collection) {
            return res.status(404).json({ success: false, message: "Collection not found" });
        }

        res.json({ success: true, message: "Collection deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getCollections,
    getCollectionBySlug,
    createCollection,
    updateCollection,
    deleteCollection
};
