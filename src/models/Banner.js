const mongoose = require("mongoose");

const BannerSchema = new mongoose.Schema(
    {
        // "home" = hero carousel on home screen, "category" = category grid banners
        type: {
            type: String,
            enum: ["home", "category"],
            required: true,
            index: true,
        },

        title: { type: String, trim: true, default: "" },

        // Full GCS public URL (or local asset path during dev)
        imageUrl: { type: String, required: true, trim: true },

        // Lower-resolution version for fast loading (optional)
        imageUrlMedium: { type: String, default: "" },

        // What happens when the user taps the banner
        linkType: {
            type: String,
            enum: ["product", "collection", "category", "url", "none"],
            default: "none",
        },
        // product handle, collection ID, or any URL depending on linkType
        linkValue: { type: String, default: "" },

        // Sorting order — lower = shown first
        order: { type: Number, default: 0, index: true },

        // Toggle banner visibility without deleting
        isActive: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Banner", BannerSchema, "banners");
