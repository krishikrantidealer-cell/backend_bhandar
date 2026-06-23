const mongoose = require("mongoose");

const OrderAddressSchema = new mongoose.Schema(
    {
        name: { type: String, default: "" },
        street: { type: String, default: "" },
        address1: { type: String, default: "" },
        address2: { type: String, default: "" },
        company: { type: String, default: "" },
        city: { type: String, default: "" },
        zip: { type: String, default: "" },
        province: { type: String, default: "" },
        country: { type: String, default: "" },
        phone: { type: String, default: "" }
    },
    { _id: false }
);

const LineItemSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        price: { type: Number, default: 0.0 },
        sku: { type: String, default: "" },
        requiresShipping: { type: Boolean, default: true },
        taxable: { type: Boolean, default: false },
        fulfillmentStatus: { type: String, default: "pending" },
        discount: { type: Number, default: 0.0 }
    },
    { _id: false }
);

const OrderSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, index: true, trim: true },
        email: { type: String, default: "", index: true, trim: true },
        phone: { type: String, default: "", index: true, trim: true },
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "cancelled", "refunded"],
            default: "pending",
            index: true
        },
        financialStatus: { type: String, default: "" },
        fulfillmentStatus: { type: String, default: "" },
        total: { type: Number, default: 0.0 },
        subtotal: { type: Number, default: 0.0 },
        shipping: { type: Number, default: 0.0 },
        taxes: { type: Number, default: 0.0 },
        discountAmount: { type: Number, default: 0.0 },
        shippingMethod: { type: String, default: "" },
        paymentMethod: { type: String, default: "" },
        createdAt: { type: Date },
        billingAddress: OrderAddressSchema,
        shippingAddress: OrderAddressSchema,
        lineItems: [LineItemSchema],
        notes: { type: String, default: "" },
        cancelledAt: { type: Date },
        importedAt: { type: Date, default: Date.now },
        razorpayOrderId: { type: String, default: "" },
        razorpayPaymentId: { type: String, default: "" },
        razorpaySignature: { type: String, default: "" }
    },
    { timestamps: true }
);

// Search Index
OrderSchema.index({
    name: "text",
    email: "text",
    phone: "text",
    "billingAddress.name": "text",
    "shippingAddress.name": "text"
});

module.exports = mongoose.model("Order", OrderSchema, "orders");
