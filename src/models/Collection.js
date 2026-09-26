const mongoose = require("mongoose");

const SubCollectionSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, lowercase: true, trim: true },
        isActive: { type: Boolean, default: true },
        image: { type: String, trim: true },
        count: { type: String, trim: true }
    },
    { _id: true, strict: false }
);

const CollectionSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, lowercase: true, trim: true },
        description: { type: String, trim: true },
        bannerImage: { type: String, trim: true },
        stripBanner: { type: String, trim: true },
        bannerTitle: { type: String, trim: true },
        headingType: { type: String, default: "both" },
        isActive: { type: Boolean, default: true },
        priority: { type: Number, default: 0 },
        subCollections: [SubCollectionSchema]
    },
    { timestamps: true, strict: false }
);

CollectionSchema.index({ slug: 1 });
CollectionSchema.index({ isActive: 1, priority: -1 });

module.exports = mongoose.model("Collection", CollectionSchema, "collections");
