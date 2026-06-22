const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema(
    {
        customerId: { type: String, required: true, unique: true, index: true, trim: true },
        firstName: { type: String, default: "", trim: true },
        lastName: { type: String, default: "", trim: true },
        email: { type: String, default: "", index: true, trim: true },
        acceptsEmailMarketing: { type: Boolean, default: false },
        defaultAddress: {
            company: { type: String, default: "" },
            address1: { type: String, default: "" },
            address2: { type: String, default: "" },
            city: { type: String, default: "" },
            provinceCode: { type: String, default: "" },
            countryCode: { type: String, default: "" },
            zip: { type: String, default: "" },
            phone: { type: String, default: "" }
        },
        phone: { type: String, default: "", index: true, trim: true },
        acceptsSmsMarketing: { type: Boolean, default: false },
        totalSpent: { type: Number, default: 0.0 },
        totalOrders: { type: Number, default: 0 },
        note: { type: String, default: "" },
        taxExempt: { type: Boolean, default: false },
        tags: [{ type: String }],
        acceptsWhatsAppMarketing: { type: Boolean, default: false },
        importedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

// Search index
CustomerSchema.index({ firstName: "text", lastName: "text", email: "text", phone: "text" });

module.exports = mongoose.model("Customer", CustomerSchema, "customers");
