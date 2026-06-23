require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        // Find "Bio Products" category
        const bioCategory = await Category.findOne({ name: "Bio Products" });
        if (!bioCategory) {
            console.error("❌ Bio Products category not found in DB");
            process.exit(1);
        }

        const bioCategoryId = bioCategory._id;
        console.log(`ℹ️ "Bio Products" Category ID is: ${bioCategoryId}`);

        // Update all BOGO products
        const result = await Product.updateMany(
            { buy1get1: true },
            { $addToSet: { categoryIds: bioCategoryId } }
        );

        console.log(`📝 Updated products count: ${result.modifiedCount}`);
        console.log("🎉 Category assignment finished successfully!");
    } catch (err) {
        console.error("❌ Error running migration:", err);
    } finally {
        await mongoose.connection.close();
    }
};

run();
