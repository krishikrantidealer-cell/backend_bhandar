const mongoose = require("mongoose");

const SubCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    bannerImage: { type: String, trim: true },
    bannerTitle: { type: String, trim: true }
});

const CategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        title: { type: String, trim: true },
        slug: { type: String, trim: true },
        handle: { type: String, trim: true },
        description: { type: String, default: "" },
        imageUrl: { type: String, default: "" },
        image: { type: mongoose.Schema.Types.Mixed },
        bannerImage: { type: String, default: "" },
        bannerTitle: { type: String, default: "" },
        iconImage: { type: String, default: "" },
        cataloguePdf: { type: String, default: "" },
        subCategories: [SubCategorySchema]
    },
    { timestamps: true, strict: false }
);

CategorySchema.index({ slug: 1 });
CategorySchema.index({ handle: 1 });

module.exports = mongoose.model("Category", CategorySchema, "categories");
