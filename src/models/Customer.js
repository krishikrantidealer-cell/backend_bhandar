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
        email: { type: String, default: "", index: true, trim: true },
        phone: { type: String, default: "", index: true, trim: true },
        totalSpent: { type: Number, default: 0.0 },
        totalOrders: { type: Number, default: 0 },
        defaultAddress: {
            company: { type: String, default: "" },
            address1: { type: String, default: "" },
            address2: { type: String, default: "" },
            city: { type: String, default: "" },
            province: { type: String, default: "" },
            country: { type: String, default: "" },
            zip: { type: String, default: "" },
            phone: { type: String, default: "" }
        },
        addresses: [CustomerAddressSchema],
        note: { type: String, default: "" },
        status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
        role: { type: String, enum: ["customer", "admin"], default: "customer", index: true },
        isprofilecompleted: { type: Boolean, default: false, index: true },
        importedAt: { type: Date, default: Date.now }
    },
    { _id: false, timestamps: true } // disable auto _id creation since we supply it explicitly
);

// Search index
CustomerSchema.index({ firstName: "text", lastName: "text", email: "text", phone: "text" });

module.exports = mongoose.model("Customer", CustomerSchema, "customers");
