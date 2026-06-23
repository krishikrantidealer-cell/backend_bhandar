require("dotenv").config();
const mongoose = require("mongoose");
const sharp = require("sharp");
const Product = require("../src/models/Product");
const { uploadToGCS } = require("../src/config/gcs");

const MONGO_URI = process.env.MONGO_URI;

const getFileExtension = (contentType, url) => {
    if (contentType) {
        const mime = contentType.toLowerCase();
        if (mime.includes("png")) return "png";
        if (mime.includes("webp")) return "webp";
        if (mime.includes("gif")) return "gif";
        if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    }
    // Fallback to URL extension
    try {
        const pathname = new URL(url).pathname;
        const ext = pathname.split(".").pop();
        if (ext && ext.length <= 4 && /^[a-zA-Z0-9]+$/.test(ext)) {
            return ext;
        }
    } catch (_) { }
    return "jpg";
};

const getMimeType = (ext) => {
    switch (ext.toLowerCase()) {
        case "png": return "image/png";
        case "webp": return "image/webp";
        case "gif": return "image/gif";
        default: return "image/jpeg";
    }
};

const isDryRun = process.argv.includes("--dry-run");

const processSingleImage = async (img, productId, index) => {
    let originalUrl = "";
    if (typeof img === "string") {
        originalUrl = img.trim();
    } else if (img && img.original) {
        originalUrl = img.original.trim();
    }

    if (!originalUrl) {
        throw new Error("Empty image URL");
    }

    console.log(`  - Fetching original: ${originalUrl}`);
    const response = await fetch(originalUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch original image (HTTP ${response.status})`);
    }

    const contentType = response.headers.get("content-type");
    const ext = getFileExtension(contentType, originalUrl);
    const originalMime = getMimeType(ext);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`  - Original image downloaded successfully (${(buffer.length / 1024).toFixed(2)} KB)`);

    // Setup destination paths in GCS
    const originalDest = `products/${productId}/image_${index}/original.${ext}`;
    const mediumDest = `products/${productId}/image_${index}/medium.webp`;
    const lowDest = `products/${productId}/image_${index}/low.webp`;

    let originalGcsUrl, mediumGcsUrl, lowGcsUrl;

    if (isDryRun) {
        console.log(`  - [Dry-Run] Simulating original upload to: ${originalDest}`);
        originalGcsUrl = `https://storage.googleapis.com/dry-run-mock-bucket/${originalDest}`;

        console.log(`  - [Dry-Run] Simulating medium resize (WebP, width 600px, 80% quality)...`);
        const mediumBuffer = await sharp(buffer)
            .resize({ width: 600, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
        console.log(`    Medium size: ${(mediumBuffer.length / 1024).toFixed(2)} KB`);
        mediumGcsUrl = `https://storage.googleapis.com/dry-run-mock-bucket/${mediumDest}`;

        console.log(`  - [Dry-Run] Simulating low resize (WebP, width 80px, 20% quality)...`);
        const lowBuffer = await sharp(buffer)
            .resize({ width: 80, withoutEnlargement: true })
            .webp({ quality: 20 })
            .toBuffer();
        console.log(`    Low size: ${(lowBuffer.length / 1024).toFixed(2)} KB`);
        lowGcsUrl = `https://storage.googleapis.com/dry-run-mock-bucket/${lowDest}`;
    } else {
        console.log(`  - Uploading original format to GCS...`);
        originalGcsUrl = await uploadToGCS(buffer, originalDest, originalMime);

        console.log(`  - Processing & uploading medium version (WebP, width 600px, 80% quality)...`);
        const mediumBuffer = await sharp(buffer)
            .resize({ width: 600, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
        mediumGcsUrl = await uploadToGCS(mediumBuffer, mediumDest, "image/webp");

        console.log(`  - Processing & uploading low version (WebP, width 80px, 20% quality)...`);
        const lowBuffer = await sharp(buffer)
            .resize({ width: 80, withoutEnlargement: true })
            .webp({ quality: 20 })
            .toBuffer();
        lowGcsUrl = await uploadToGCS(lowBuffer, lowDest, "image/webp");
    }

    return {
        original: originalGcsUrl,
        medium: mediumGcsUrl,
        low: lowGcsUrl
    };
};

const runMigration = async () => {
    if (isDryRun) {
        console.log("⚠️ Running in DRY RUN mode. No data will be written to MongoDB or Google Cloud Storage.");
    }
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI is missing in .env");
        process.exit(1);
    }

    try {
        console.log("🌱 Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        // Fetch products using lean() to easily inspect string vs object format
        const products = await Product.find({}).lean();
        console.log(`📦 Found ${products.length} products to check`);

        let processedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // In dry run or test, we might want to process a limited number of products
        const limitCount = isDryRun ? 5 : products.length;
        const productsToProcess = products.slice(0, limitCount);

        if (isDryRun) {
            console.log(`ℹ️ [Dry-Run] Testing first ${productsToProcess.length} products with images`);
        }

        for (let i = 0; i < productsToProcess.length; i++) {
            const product = productsToProcess[i];
            const hasImages = product.images && product.images.length > 0;

            if (!hasImages) {
                skippedCount++;
                continue;
            }

            console.log(`\nProcessing [${i + 1}/${productsToProcess.length}] product: "${product.title}" (${product._id})`);

            let needsUpdate = false;
            const updatedImages = [];

            for (let j = 0; j < product.images.length; j++) {
                const img = product.images[j];

                // If the image is already processed with original, medium, and low keys, skip processing
                if (typeof img === "object" && img.original && img.medium && img.low) {
                    updatedImages.push(img);
                    continue;
                }

                needsUpdate = true;
                try {
                    console.log(`Processing image ${j + 1}...`);
                    const result = await processSingleImage(img, product._id, j);
                    updatedImages.push(result);
                    console.log(`✅ Image ${j + 1} processed successfully`);
                } catch (err) {
                    console.error(`❌ Error processing image ${j + 1} for product "${product.title}": ${err.message}`);
                    errorCount++;
                    updatedImages.push(img);
                }
            }

            if (needsUpdate && !isDryRun) {
                await Product.updateOne(
                    { _id: product._id },
                    { $set: { images: updatedImages } }
                );
                console.log(`📝 Product document updated in MongoDB`);
                processedCount++;
            } else if (needsUpdate && isDryRun) {
                console.log(`📝 [Dry-Run] Product would have been updated in MongoDB`);
                processedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`\n🎉 Image processing migration finished!`);
        console.log(`----------------------------------------`);
        console.log(`Products updated/processed: ${processedCount}`);
        console.log(`Products skipped: ${skippedCount}`);
        console.log(`Errors encountered: ${errorCount}`);
        console.log(`----------------------------------------`);

    } catch (error) {
        console.error("❌ Critical migration error:", error);
    } finally {
        await mongoose.connection.close();
        console.log("🔌 MongoDB connection closed");
    }
};

runMigration();
