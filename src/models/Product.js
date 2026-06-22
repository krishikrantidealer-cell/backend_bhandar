const mongoose = require("mongoose");

const VariantSchema = new mongoose.Schema(
    {
        sku: { type: String, default: "" },
        option: { type: String, default: "" },
        price: { type: String, default: "" },
        compareAtPrice: { type: String, default: "" },
        stock: { type: String, default: "" }
    },
    { _id: false }
);

const ProductSchema = new mongoose.Schema(
    {
        handle: { type: String, required: true, unique: true, trim: true },
        title: { type: String, required: true, trim: true },
        bodyHtml: { type: String, default: "" },
        vendor: { type: String, default: "" },
        status: { type: String, default: "active" },
        categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
        variants: [VariantSchema],
        images: [{ type: String }],
        importedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

// Text index for search
ProductSchema.index({ title: "text", vendor: "text" });

module.exports = mongoose.model("ProductRaw", ProductSchema, "products_raw");
