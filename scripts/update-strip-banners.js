require("dotenv").config();
const mongoose = require("mongoose");
const sharp = require("sharp");
const { uploadToGCS } = require("../src/config/gcs");
const Category = require("../src/models/Category");
const Collection = require("../src/models/Collection");
const Banner = require("../src/models/Banner");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const stripBannersData = [
    {
        key: "insecticides",
        title: "Insecticides",
        slug: "insecticides",
        linkType: "category",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/Insecticides_New_726a2744-fc90-42a6-a48b-1013a5b26b55.png?v=1784628915",
        targetType: "category",
        order: 1
    },
    {
        key: "fungicides",
        title: "Fungicides",
        slug: "fungicides",
        linkType: "category",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/Fungicides_New_459199bb-d20d-4983-b741-e031a58d5ae2.png?v=1784628916",
        targetType: "category",
        order: 2
    },
    {
        key: "herbicides",
        title: "Herbicides",
        slug: "herbicides",
        linkType: "category",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/Herbicides_New_a310f3d5-9295-4715-8ac6-983ba9c3424c.png?v=1784628915",
        targetType: "category",
        order: 3
    },
    {
        key: "fertilizers",
        title: "Fertilizers",
        slug: "fertilizers",
        linkType: "category",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/Fertilizers_New_d711af01-a8a0-493a-b4e4-881b4c29cb52.png?v=1784628915",
        targetType: "category",
        order: 4
    },
    {
        key: "pgrs",
        title: "PGRs",
        slug: "pgrs",
        linkType: "category",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/PGRs_New_fdd490af-ab2e-4f39-9d70-d918c907a7af.png?v=1784628915",
        targetType: "category",
        order: 5
    },
    {
        key: "best_sellers",
        title: "Best Sellers",
        slug: "best-sellers",
        linkType: "collection",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/Best_Sellers_New_0141dc78-17a7-4681-a1a8-58ac8248a5c4.png?v=1784628915",
        targetType: "collection",
        order: 6
    },
    {
        key: "buy_1_get_1",
        title: "Buy 1 Get 1",
        slug: "buy-1-get-1",
        linkType: "collection",
        url: "https://cdn.shopify.com/s/files/1/0627/9204/0601/files/Buy_1_get_1_new.png?v=1784628915",
        targetType: "collection",
        order: 7
    }
];

async function run() {
    try {
        console.log("🌱 Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        // Clear old category strip banners from banners collection
        await Banner.deleteMany({ type: "category" });
        console.log("🧹 Cleared old category strip banners from banners collection");

        for (const item of stripBannersData) {
            console.log(`\n📥 Downloading & processing "${item.title}" from: ${item.url}`);
            const res = await fetch(item.url);
            if (!res.ok) {
                throw new Error(`Failed to download ${item.title}: HTTP ${res.status}`);
            }

            const rawBuffer = Buffer.from(await res.arrayBuffer());

            // Convert full to WebP
            const fullWebp = await sharp(rawBuffer).webp({ quality: 85 }).toBuffer();
            const fullDest = `banners/strip/${item.key}_full.webp`;
            const fullGcsUrl = await uploadToGCS(fullWebp, fullDest, "image/webp");
            console.log(`  ✅ Uploaded full: ${fullGcsUrl}`);

            // Convert medium to WebP (width 800px)
            const medWebp = await sharp(rawBuffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
            const medDest = `banners/strip/${item.key}_med.webp`;
            const medGcsUrl = await uploadToGCS(medWebp, medDest, "image/webp");
            console.log(`  ✅ Uploaded med: ${medGcsUrl}`);

            // 1. Insert into banners collection
            await Banner.create({
                type: "category",
                title: item.title,
                imageUrl: fullGcsUrl,
                imageUrlMedium: medGcsUrl,
                linkType: item.linkType,
                linkValue: item.slug,
                order: item.order,
                isActive: true
            });
            console.log(`  📝 Created Banner record in 'banners' collection (order: ${item.order})`);

            // 2. Update Categories if category
            if (item.targetType === "category") {
                const catUpdate = await Category.findOneAndUpdate(
                    {
                        $or: [
                            { slug: item.slug },
                            { name: new RegExp(`^${item.title}$`, "i") }
                        ]
                    },
                    {
                        $set: {
                            bannerImage: fullGcsUrl,
                            bannerTitle: item.title,
                            stripBanner: fullGcsUrl,
                            imageUrl: fullGcsUrl
                        }
                    },
                    { returnDocument: 'after' }
                );
                if (catUpdate) {
                    console.log(`  📝 Updated Category "${catUpdate.name}"`);
                }
            }

            // 3. Update Collections if collection
            if (item.targetType === "collection") {
                const colUpdate = await Collection.findOneAndUpdate(
                    {
                        $or: [
                            { slug: item.slug },
                            { name: new RegExp(`^${item.title}$`, "i") }
                        ]
                    },
                    {
                        $set: {
                            name: item.title,
                            slug: item.slug,
                            bannerImage: fullGcsUrl,
                            bannerTitle: item.title,
                            stripBanner: fullGcsUrl,
                            isActive: true
                        },
                        $setOnInsert: {
                            priority: item.order,
                            subCollections: []
                        }
                    },
                    { upsert: true, returnDocument: 'after' }
                );
                console.log(`  📝 Upserted Collection "${colUpdate.name}"`);
            }
        }

        console.log("\n🎉 All strip banners reordered and saved successfully!");
    } catch (err) {
        console.error("❌ Error running script:", err);
    } finally {
        await mongoose.connection.close();
        console.log("🔌 MongoDB connection closed");
    }
}

run();
