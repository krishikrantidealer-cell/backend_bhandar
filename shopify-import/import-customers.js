const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");

// ===== Mongo Connection =====
const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

// ===== Schema =====
const CustomerSchema = new mongoose.Schema({
    customerId: { type: String, required: true, unique: true },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    email: { type: String, default: "" },
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
    phone: { type: String, default: "" },
    acceptsSmsMarketing: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0.0 },
    totalOrders: { type: Number, default: 0 },
    note: { type: String, default: "" },
    taxExempt: { type: Boolean, default: false },
    tags: [{ type: String }],
    acceptsWhatsAppMarketing: { type: Boolean, default: false },
    importedAt: { type: Date, default: Date.now }
}, { strict: false });

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

function parseBool(val) {
    if (!val) return false;
    const v = val.trim().toLowerCase();
    return v === "yes" || v === "true";
}

async function importCustomers() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

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

            // Extract tags
            let tagsArray = [];
            if (row["Tags"]) {
                tagsArray = row["Tags"]
                    .split(",")
                    .map(t => t.trim())
                    .filter(t => t.length > 0);
            }

            const customer = {
                customerId,
                firstName: row["First Name"] || "",
                lastName: row["Last Name"] || "",
                email: row["Email"] || "",
                acceptsEmailMarketing: parseBool(row["Accepts Email Marketing"]),
                defaultAddress: {
                    company: row["Default Address Company"] || "",
                    address1: row["Default Address Address1"] || "",
                    address2: row["Default Address Address2"] || "",
                    city: row["Default Address City"] || "",
                    provinceCode: row["Default Address Province Code"] || "",
                    countryCode: row["Default Address Country Code"] || "",
                    zip: clean(row["Default Address Zip"] || ""),
                    phone: clean(row["Default Address Phone"] || "")
                },
                phone: clean(row["Phone"] || ""),
                acceptsSmsMarketing: parseBool(row["Accepts SMS Marketing"]),
                totalSpent: parseFloat(row["Total Spent"]) || 0.0,
                totalOrders: parseInt(row["Total Orders"], 10) || 0,
                note: row["Note"] || "",
                taxExempt: parseBool(row["Tax Exempt"]),
                tags: tagsArray,
                acceptsWhatsAppMarketing: parseBool(row["Accepts WhatsApp Marketing"]),
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
