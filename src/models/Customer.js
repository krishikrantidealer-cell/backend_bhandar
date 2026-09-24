const mongoose = require("mongoose");

const CustomerAddressSchema = new mongoose.Schema({
    name: { type: String, default: "" },
    street: { type: String, default: "" },
    address1: { type: String, default: "" },
    address2: { type: String, default: "" },
    city: { type: String, default: "" },
    province: { type: String, default: "" },
    country: { type: String, default: "India" },
    zip: { type: String, default: "" },
    phone: { type: String, default: "" },
    isDefault: { type: Boolean, default: false }
});

const CustomerSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true }, // The custom Customer ID as primary key
        firstName: { type: String, default: "", trim: true },
        lastName: { type: String, default: "", trim: true },
        name: { type: String, default: "", trim: true },
        email: { type: String, default: "", trim: true },
        phone: { type: String, default: "", trim: true },
        totalSpent: { type: Number, default: 0.0 },
        totalOrders: { type: Number, default: 0 },
        defaultAddress: {
            company: { type: String, default: "" },
            address1: { type: String, default: "" },
            address2: { type: String, default: "" },
            city: { type: String, default: "" },
            province: { type: String, default: "" },
            country: { type: String, default: "India" },
            zip: { type: String, default: "" },
            phone: { type: String, default: "" }
        },
        addresses: [CustomerAddressSchema],
        note: { type: String, default: "" },
        status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
        role: { type: String, enum: ["customer", "admin"], default: "customer", index: true },
        password: { type: String, default: null },
        isprofilecompleted: { type: Boolean, default: false, index: true },
        isProfileCompleted: { type: Boolean, default: false, index: true },
        importedAt: { type: Date, default: Date.now }
    },
    { _id: false, timestamps: true, strict: false }
);

// Search index
CustomerSchema.index({ firstName: "text", lastName: "text", email: "text", phone: "text" });

// Performance Indexes
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ status: 1, role: 1 });
CustomerSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Customer", CustomerSchema, "customers");
