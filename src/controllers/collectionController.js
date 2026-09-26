const Collection = require("../models/Collection");
const Product = require("../models/Product");

// GET /api/collections
const getCollections = async (req, res) => {
    try {
        const collections = await Collection.find({ isActive: true }).sort({ priority: -1, name: 1 }).lean();

        // Dynamically calculate real product count for each collection and sub-collection
        for (const col of collections) {
            const colNameEscaped = (col.name || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const colFilter = {
                status: "active",
                $or: [
                    { assignedCollections: col.name },
                    { assignedCollections: new RegExp(`^${colNameEscaped}$`, "i") },
                    { assignedCollections: col.slug },
                    { assignedCollections: col._id.toString() }
                ]
            };
            if (/best[-_ ]?sellers?/i.test(col.name)) {
                colFilter.$or.push({ tags: /best[-_ ]?sellers?|bestseller/i });
            }
            if (/buy[-_ ]?1[-_ ]?get[-_ ]?1/i.test(col.name)) {
                colFilter.$or.push({ buy1get1: true });
            }

            col.productsCount = await Product.countDocuments(colFilter);
            col.count = `${col.productsCount} ${col.productsCount === 1 ? 'Product' : 'Products'}`;

            if (Array.isArray(col.subCollections) && col.subCollections.length > 0) {
                for (const sub of col.subCollections) {
                    const subName = (sub.name || "").trim();
                    const subSlug = (sub.slug || "").trim();
                    const subNameEscaped = subName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    const subFilter = {
                        status: "active",
                        $or: [
                            { assignedCollections: subName },
                            { assignedCollections: new RegExp(`^${subNameEscaped}$`, "i") },
                            { assignedCollections: subSlug },
                            { tags: new RegExp(`^${subNameEscaped}$`, "i") },
                            { category: new RegExp(`^${subNameEscaped}$`, "i") }
                        ].filter(Boolean)
                    };

                    const realCount = await Product.countDocuments(subFilter);
                    sub.productsCount = realCount;
                    sub.count = `${realCount} ${realCount === 1 ? 'Product' : 'Products'}`;
                }
            }
        }

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

        if (Array.isArray(collection.subCollections) && collection.subCollections.length > 0) {
            for (const sub of collection.subCollections) {
                const subName = (sub.name || "").trim();
                const subSlug = (sub.slug || "").trim();
                const subNameEscaped = subName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                const subFilter = {
                    status: "active",
                    $or: [
                        { assignedCollections: subName },
                        { assignedCollections: new RegExp(`^${subNameEscaped}$`, "i") },
                        { assignedCollections: subSlug },
                        { tags: new RegExp(`^${subNameEscaped}$`, "i") },
                        { category: new RegExp(`^${subNameEscaped}$`, "i") }
                    ].filter(Boolean)
                };

                const realCount = await Product.countDocuments(subFilter);
                sub.productsCount = realCount;
                sub.count = `${realCount} ${realCount === 1 ? 'Product' : 'Products'}`;
            }
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
                return {
                    name: s.name,
                    slug: s.slug || (s.name ? s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""),
                    image: s.image || "",
                    count: s.count || "",
                    isActive: s.isActive !== undefined ? s.isActive : true
                };
            });
        }

        const collection = new Collection({
            name: data.name,
            slug,
            description: data.description || "",
            bannerImage: data.bannerImage || "",
            stripBanner: data.stripBanner || "",
            bannerTitle: data.bannerTitle || data.name,
            headingType: data.headingType || "both",
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
