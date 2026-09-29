const Category = require("../models/Category");
const Collection = require("../models/Collection");
const mongoose = require("mongoose");

// GET /api/categories
const getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1, title: 1 }).lean();
        res.json({
            success: true,
            count: categories.length,
            categories,
            data: categories
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/categories/:id
const getCategoryById = async (req, res) => {
    try {
        const cleanId = (req.params.id || "").trim();
        let category = null;

        if (mongoose.Types.ObjectId.isValid(cleanId)) {
            category = await Category.findById(cleanId).lean();
        }

        if (!category) {
            category = await Category.findOne({
                $or: [
                    { slug: cleanId },
                    { slug: new RegExp(`^${cleanId}$`, "i") },
                    { name: new RegExp(`^${cleanId}$`, "i") },
                    { title: new RegExp(`^${cleanId}$`, "i") }
                ]
            }).lean();
        }

        if (!category) {
            // Also check collections
            let col = null;
            if (mongoose.Types.ObjectId.isValid(cleanId)) {
                col = await Collection.findById(cleanId).lean();
            }
            if (!col) {
                col = await Collection.findOne({
                    $or: [
                        { slug: cleanId },
                        { slug: new RegExp(`^${cleanId}$`, "i") },
                        { name: new RegExp(`^${cleanId}$`, "i") }
                    ]
                }).lean();
            }

            if (col) {
                return res.json({
                    success: true,
                    category: {
                        _id: col._id,
                        id: col._id,
                        name: col.name,
                        title: col.name,
                        slug: col.slug,
                        bannerImage: col.bannerImage || "",
                        image: col.bannerImage || ""
                    },
                    data: {
                        _id: col._id,
                        id: col._id,
                        name: col.name,
                        title: col.name,
                        slug: col.slug,
                        bannerImage: col.bannerImage || "",
                        image: col.bannerImage || ""
                    }
                });
            }

            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.json({
            success: true,
            category,
            data: category
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/categories (Admin Only)
const createCategory = async (req, res) => {
    try {
        const data = { ...req.body };
        delete data._id;
        delete data.id;

        if (!data.name) {
            return res.status(400).json({ success: false, message: "Category name is required" });
        }

        let slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const existing = await Category.findOne({ slug });
        if (existing) {
            slug = `${slug}-${Date.now()}`;
        }

        const bannerImg = data.bannerImage || data.imageUrl || data.image || "";

        let subCategories = data.subCategories || [];
        if (typeof subCategories === "string") {
            subCategories = subCategories
                .split(",")
                .map(s => s.trim())
                .filter(Boolean)
                .map(name => ({ name }));
        } else if (Array.isArray(subCategories)) {
            subCategories = subCategories.map(s => {
                if (typeof s === "string") return { name: s };
                return s;
            });
        }

        const category = new Category({
            name: data.name,
            title: data.title || data.name,
            slug,
            handle: slug,
            description: data.description || "",
            imageUrl: bannerImg,
            image: bannerImg,
            bannerImage: bannerImg,
            bannerTitle: data.bannerTitle || data.title || data.name,
            iconImage: data.iconImage || "",
            cataloguePdf: data.cataloguePdf || "",
            stripBanner: data.stripBanner || "",
            subCategories
        });

        await category.save();
        res.status(201).json({ success: true, category, data: category });
    } catch (error) {
        console.error("❌ createCategory error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/categories/:id (Admin Only)
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };

        // Strip immutable ID fields so MongoDB findOneAndUpdate does not fail
        delete data._id;
        delete data.id;

        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { slug: id };
        }

        // Synchronize banner image fields
        const bannerImg = data.bannerImage || data.imageUrl || data.image || "";
        if (bannerImg) {
            data.bannerImage = bannerImg;
            data.imageUrl = bannerImg;
            data.image = bannerImg;
        }

        if (data.subCategories && typeof data.subCategories === "string") {
            data.subCategories = data.subCategories
                .split(",")
                .map(s => s.trim())
                .filter(Boolean)
                .map(name => ({ name }));
        } else if (Array.isArray(data.subCategories)) {
            data.subCategories = data.subCategories.map(s => {
                if (typeof s === "string") return { name: s };
                const subObj = { ...s };
                if (subObj._id && !mongoose.Types.ObjectId.isValid(subObj._id)) {
                    delete subObj._id;
                }
                if (subObj.id && !mongoose.Types.ObjectId.isValid(subObj.id)) {
                    delete subObj.id;
                }
                return subObj;
            });
        }

        const category = await Category.findOneAndUpdate(query, { $set: data }, { new: true, runValidators: true });
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.json({ success: true, category, data: category });
    } catch (error) {
        console.error("❌ updateCategory error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/categories/:id (Admin Only)
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { slug: id };
        }

        const category = await Category.findOneAndDelete(query);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        res.json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory
};
