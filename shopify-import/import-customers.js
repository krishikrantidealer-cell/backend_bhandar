const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");

// ===== Mongo Connection =====
const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

// ===== Schema =====
const CustomerSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
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
    note: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    importedAt: { type: Date, default: Date.now }
}, { _id: false, strict: false });

const Customer = mongoose.model("Customer", CustomerSchema, "customers");

// Utility to clean values by removing leading single quotes and trimming
function clean(val) {
    if (typeof val !== "string") return val;
    let v = val.trim();
    if (v.startsWith("'")) {
        v = v.substring(1);
    }
    return v;
}

async function importCustomers() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

        // Try to drop the obsolete index from the previous schema
        try {
            await mongoose.connection.collection("customers").dropIndex("customerId_1");
            console.log("🗑 Dropped obsolete index: customerId_1");
        } catch (e) {
            // Ignore if index doesn't exist
        }

        const rows = [];

        // Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream("./customers_export.csv")
                .pipe(csv())
                .on("data", (data) => rows.push(data))
                .on("end", resolve)
                .on("error", reject);
        });

        console.log(`✅ CSV Loaded: ${rows.length} rows`);

        const customers = [];

        rows.forEach((row) => {
            const rawId = row["Customer ID"];
            if (!rawId) return;

            const customerId = clean(rawId);

            const customer = {
                _id: customerId, // map directly to _id
                firstName: row["First Name"] || "",
                lastName: row["Last Name"] || "",
                email: row["Email"] || "",
                phone: clean(row["Phone"] || ""),
                totalSpent: parseFloat(row["Total Spent"]) || 0.0,
                totalOrders: parseInt(row["Total Orders"], 10) || 0,
                defaultAddress: {
                    company: row["Default Address Company"] || "",
                    address1: row["Default Address Address1"] || "",
                    address2: row["Default Address Address2"] || "",
                    city: row["Default Address City"] || "",
                    province: row["Default Address Province Code"] || "",
                    country: row["Default Address Country Code"] || "",
                    zip: clean(row["Default Address Zip"] || ""),
                    phone: clean(row["Default Address Phone"] || "")
                },
                note: row["Note"] || "",
                status: "active",
                importedAt: new Date()
            };

            customers.push(customer);
        });

        console.log(`✅ Parsed ${customers.length} customers`);

        // Clear old data
        await Customer.deleteMany({});
        console.log("🗑 Cleared old customers");

        // Insert new data
        await Customer.insertMany(customers);
        console.log(`✅ Imported ${customers.length} customers successfully`);

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("❌ ERROR:");
        console.error(error);
        process.exit(1);
    }
}

importCustomers();
