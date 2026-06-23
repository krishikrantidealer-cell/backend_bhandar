const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductRaw", required: true },
        variantId: { type: mongoose.Schema.Types.ObjectId },
        variantSku: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true }, // Store price at the time of adding
        title: { type: String, default: "" },
        option: { type: String, default: "" }
    },
    { _id: false }
);

const CartSchema = new mongoose.Schema(
    {
        customerId: { type: String, required: true, unique: true, index: true }, // customer _id (Shopify string customer ID)
        items: [CartItemSchema],
        couponCode: { type: String, default: "" },
        subtotal: { type: Number, default: 0.0 },
        discountAmount: { type: Number, default: 0.0 },
        total: { type: Number, default: 0.0 }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Cart", CartSchema, "carts");
