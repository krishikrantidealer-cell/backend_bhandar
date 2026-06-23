const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
        value: { type: Number, required: true }, // absolute value of discount, e.g. 10.0 or 100.0
        valueType: { type: String, enum: ["percentage", "fixed_amount"], required: true },
        minimumPurchase: { type: Number, default: 0.0 },
        status: { type: String, enum: ["active", "expired"], default: "active", index: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date },
        timesUsed: { type: Number, default: 0 }
    },
    { timestamps: true }
);

// Search Index
CouponSchema.index({ code: "text" });

module.exports = mongoose.model("Coupon", CouponSchema, "coupons");
