const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true, index: true },
        userName: { type: String, default: "Verified Buyer", trim: true },
        userPhone: { type: String, default: "", trim: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, default: "", trim: true },
        images: [{ type: String }],
        status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
        verifiedPurchase: { type: Boolean, default: true }
    },
    { timestamps: true }
);

ReviewSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model("Review", ReviewSchema, "reviews");
