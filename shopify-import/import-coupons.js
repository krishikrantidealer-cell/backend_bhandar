const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");

// ===== Mongo Connection =====
const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

// ===== Schema =====
const CouponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    value: { type: Number, required: true },
    valueType: { type: String, enum: ["percentage", "fixed_amount"], required: true },
    minimumPurchase: { type: Number, default: 0.0 },
    status: { type: String, enum: ["active", "expired"], default: "active" },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    timesUsed: { type: Number, default: 0 }
}, { strict: false });

const Coupon = mongoose.model("Coupon", CouponSchema, "coupons");

function parseDate(val) {
    if (!val) return null;
    const d = new Date(val.trim());
    return isNaN(d.getTime()) ? null : d;
}

async function importCoupons() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

        const rows = [];

        // Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream("./discounts_export_1.csv")
                .pipe(csv())
                .on("data", (data) => rows.push(data))
                .on("end", resolve)
                .on("error", reject);
        });

        console.log(`✅ CSV Loaded: ${rows.length} rows`);

        const coupons = [];

        rows.forEach((row) => {
            const code = (row["Name"] || "").trim();
            if (!code) return;

            const rawValue = parseFloat(row["Value"]) || 0.0;
            // Store value as positive discount amount
            const value = Math.abs(rawValue);

            const valueType = (row["Value Type"] || "").trim().toLowerCase() === "percentage" ? "percentage" : "fixed_amount";
            const minPurchase = parseFloat(row["Minimum Purchase Requirements"]) || 0.0;

            const startDate = parseDate(row["Start"]) || new Date();
            const endDate = parseDate(row["End"]);

            // Determine status based on CSV status and end date
            let status = (row["Status"] || "").trim().toLowerCase() === "active" ? "active" : "expired";
            if (endDate && endDate < new Date()) {
                status = "expired";
            }

            const timesUsed = parseInt(row["Times Used In Total"], 10) || 0;

            const coupon = {
                code,
                value,
                valueType,
                minimumPurchase: minPurchase,
                status,
                startDate,
                endDate,
                timesUsed
            };

            coupons.push(coupon);
        });

        console.log(`✅ Parsed ${coupons.length} coupons`);

        // Clear old data
        await Coupon.deleteMany({});
        console.log("🗑 Cleared old coupons");

        // Insert new data
        await Coupon.insertMany(coupons);
        console.log(`✅ Imported ${coupons.length} coupons successfully`);

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("❌ ERROR:");
        console.error(error);
        process.exit(1);
    }
}

importCoupons();
