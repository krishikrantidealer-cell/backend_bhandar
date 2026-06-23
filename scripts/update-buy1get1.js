require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");

const MONGO_URI = process.env.MONGO_URI;

const runMigration = async () => {
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI is missing in .env");
        process.exit(1);
    }

    try {
        console.log("🌱 Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        const products = await Product.find({});
        console.log(`📦 Found ${products.length} products to check`);

        let bogoCount = 0;
        let normalCount = 0;

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const title = product.title || "";
            const handle = product.handle || "";

            // Check if title or handle matches the Buy 1 Get 1 patterns
            const isBuy1Get1 = /1\+1\s+Free/i.test(title) || 
                               /1-1-free/i.test(handle) || 
                               /1\+1\s+Free\s+Offer/i.test(title) ||
                               /BOGO/i.test(title);

            if (isBuy1Get1) {
                product.buy1get1 = true;
                bogoCount++;
                console.log(`🎁 [BOGO] flagged true: "${title}"`);
            } else {
                product.buy1get1 = false;
                normalCount++;
            }

            await product.save();
        }

        console.log(`\n🎉 Buy1Get1 migration finished!`);
        console.log(`----------------------------------------`);
        console.log(`BOGO products flagged true: ${bogoCount}`);
        console.log(`Normal products flagged false: ${normalCount}`);
        console.log(`Total products updated: ${bogoCount + normalCount}`);
        console.log(`----------------------------------------`);

    } catch (error) {
        console.error("❌ Critical migration error:", error);
    } finally {
        await mongoose.connection.close();
        console.log("🔌 MongoDB connection closed");
    }
};

runMigration();
