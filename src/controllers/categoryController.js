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

module.exports = { getAllCategories, getCategoryById };
