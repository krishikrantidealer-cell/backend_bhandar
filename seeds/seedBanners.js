/**
 * seeds/seedBanners.js
 * 
 * One-shot script: uploads the local banner assets to GCS and seeds
 * the MongoDB `banners` collection.
 * 
 * Usage: node seeds/seedBanners.js
 * 
 * Run once from the backend_bhandar root directory.
 */

require("dotenv").config({ path: ".env" });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const sharp = require("sharp");
const { uploadToGCS } = require("../src/config/gcs");
const Banner = require("../src/models/Banner");

// ─── Path to Flutter assets ───────────────────────────────────────────────────
// __dirname = .../office_work/backend_bhandar/seeds
// krishibhandar is a sibling of backend_bhandar under office_work
const FLUTTER_ASSETS = path.resolve(__dirname, "../../krishibhandar/assets");

// ─── Banner seed definitions ─────────────────────────────────────────────────
const HOME_BANNERS = [
    {
        fileName: "home_banners/home_banner1.png",
        title: "Rakshak – Premium Insecticide",
        linkType: "product",
        linkValue: "rakshak-novaluron-indoxacarb-sc",
        order: 1,
    },
    {
        fileName: "home_banners/home_banner2.png",
        title: "Download on Play Store",
        linkType: "url",
        linkValue: "https://play.google.com/store/apps/details?id=com.snss.ebs.kisan_sewa_kendra",
        order: 2,
    },
];

// Each category banner uses the category image from assets/categories/
// linkType = "collection" means the app opens a Collection filtered view
const CATEGORY_BANNERS = [
    {
        fileName: "categories/Antibiotics.png",
        title: "Antibiotics",
        linkType: "collection",
        linkValue: "antibiotics",
        order: 1,
    },
    {
        fileName: "categories/Bio Nematicide.png",
        title: "Bio Nematicide",
        linkType: "collection",
        linkValue: "bio-nematicide",
        order: 2,
    },
    {
        fileName: "categories/Bio-Products.png",
        title: "Bio Products",
        linkType: "collection",
        linkValue: "bio-products",
        order: 3,
    },
    {
        fileName: "categories/Micronutrients.png",
        title: "Micronutrients",
        linkType: "collection",
        linkValue: "micronutrients",
        order: 4,
    },
    {
        fileName: "categories/Organic Fertilizers.png",
        title: "Organic Fertilizers",
        linkType: "collection",
        linkValue: "organic-fertilizers",
        order: 5,
    },
    {
        fileName: "categories/Organic Fungicides.png",
        title: "Organic Fungicides",
        linkType: "collection",
        linkValue: "organic-fungicides",
        order: 6,
    },
    {
        fileName: "categories/Organic Insecticides.png",
        title: "Organic Insecticides",
        linkType: "collection",
        linkValue: "organic-insecticides",
        order: 7,
    },
];

async function uploadBanner({ fileName, title, linkType, linkValue, order, type }) {
    const localPath = path.join(FLUTTER_ASSETS, fileName);
    if (!fs.existsSync(localPath)) {
        console.error(`  ❌ File not found: ${localPath}`);
        return null;
    }

    const timestamp = Date.now();
    const safeFileName = path.basename(fileName).replace(/\s+/g, "_").replace(/\.png$/i, "");
    const gcsBase = `banners/${type}/${safeFileName}_${timestamp}`;

    console.log(`  📤 Uploading ${fileName}...`);

    // Full quality webp
    const fullBuffer = await sharp(localPath).webp({ quality: 85 }).toBuffer();
    const fullUrl = await uploadToGCS(fullBuffer, `${gcsBase}_full.webp`, "image/webp");

    // Medium thumbnail (400px wide) for progressive loading
    const medBuffer = await sharp(localPath).resize({ width: 400 }).webp({ quality: 60 }).toBuffer();
    const medUrl = await uploadToGCS(medBuffer, `${gcsBase}_med.webp`, "image/webp");

    console.log(`  ✅ Uploaded → ${fullUrl}`);
    return { fullUrl, medUrl };
}

async function seed() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error("❌ MONGO_URI not set in .env");
        process.exit(1);
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // ─── Home Banners ─────────────────────────────────────────────────────────
    console.log("🏠 Seeding HOME banners...");
    for (const def of HOME_BANNERS) {
        const existing = await Banner.findOne({ title: def.title, type: "home" });
        if (existing) {
            console.log(`  ⏭  Skipped (already exists): ${def.title}`);
            continue;
        }

        const urls = await uploadBanner({ ...def, type: "home" });
        if (!urls) continue;

        await Banner.create({
            type: "home",
            title: def.title,
            imageUrl: urls.fullUrl,
            imageUrlMedium: urls.medUrl,
            linkType: def.linkType,
            linkValue: def.linkValue,
            order: def.order,
            isActive: true,
        });
        console.log(`  💾 Saved: ${def.title}`);
    }

    // ─── Category Banners ─────────────────────────────────────────────────────
    console.log("\n🗂  Seeding CATEGORY banners...");
    for (const def of CATEGORY_BANNERS) {
        const existing = await Banner.findOne({ title: def.title, type: "category" });
        if (existing) {
            console.log(`  ⏭  Skipped (already exists): ${def.title}`);
            continue;
        }

        const urls = await uploadBanner({ ...def, type: "category" });
        if (!urls) continue;

        await Banner.create({
            type: "category",
            title: def.title,
            imageUrl: urls.fullUrl,
            imageUrlMedium: urls.medUrl,
            linkType: def.linkType,
            linkValue: def.linkValue,
            order: def.order,
            isActive: true,
        });
        console.log(`  💾 Saved: ${def.title}`);
    }

    console.log("\n🌱 Seeding complete!");
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
