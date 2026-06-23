const mongoose = require("mongoose");

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
            province: { type: String, default: "" }, // State/Province code mapped from CSV
            country: { type: String, default: "" },  // Country code mapped from CSV
            zip: { type: String, default: "" },
            phone: { type: String, default: "" }
        },
        note: { type: String, default: "" },
        status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
        importedAt: { type: Date, default: Date.now }
    },
    { _id: false, timestamps: true } // disable auto _id creation since we supply it explicitly
);

// Search index
CustomerSchema.index({ firstName: "text", lastName: "text", email: "text", phone: "text" });

module.exports = mongoose.model("Customer", CustomerSchema, "customers");
