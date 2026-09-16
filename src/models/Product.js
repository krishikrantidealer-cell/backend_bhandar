const mongoose = require("mongoose");

const VariantSchema = new mongoose.Schema(
    {
        sku: { type: String, default: "" },
        option: { type: String, default: "" },
        title: { type: String, default: "" },
        price: { type: String, default: "" },
        compareAtPrice: { type: String, default: "" },
        stock: { type: String, default: "" }
    },
    { strict: false }
);

const ProductSchema = new mongoose.Schema(
    {
        handle: { type: String, required: true, unique: true, trim: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        bodyHtml: { type: String, default: "" },
        vendor: { type: String, default: "" },
        productType: { type: String, default: "" },
        status: { type: String, default: "active" },
        tags: [{ type: String }],
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
        categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
        assignedCollections: [{ type: String }],
        variants: [VariantSchema],
        images: [
            {
                original: { type: String, default: "" },
                medium: { type: String, default: "" },
                low: { type: String, default: "" }
            }
        ],
        buy1get1: { type: Boolean, default: false },
        importedAt: { type: Date, default: Date.now }
    },
    { timestamps: true, strict: false }
);

// Text index for search
ProductSchema.index({ title: "text", vendor: "text" });

// Compound & Performance Indexes
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ categoryId: 1, status: 1 });
ProductSchema.index({ categoryIds: 1, status: 1 });
ProductSchema.index({ assignedCollections: 1, status: 1 });
ProductSchema.index({ "variants.sku": 1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ buy1get1: 1, status: 1 });

module.exports = mongoose.model("Product", ProductSchema, "products");
