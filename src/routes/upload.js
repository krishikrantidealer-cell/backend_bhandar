const express = require("express");
const router = express.Router();
const multer = require("multer");
const { uploadToGCS } = require("../config/gcs");
const { optionalAuthMiddleware } = require("../middleware/auth");

const sharp = require("sharp");

// In-memory multer — no disk writes, upload directly to GCS
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max (compressed down automatically)
});

/**
 * POST /api/upload
 * Generic image upload to Krishi Bhandar GCS bucket with automatic Sharp compression.
 * Accepts: multipart/form-data with field "file" or "image"
 * Body field "folder" (optional, default: "images", e.g. "reviews", "categories", "products")
 * Returns: { success: true, url: "https://storage.googleapis.com/..." }
 */
router.post(
    "/",
    optionalAuthMiddleware,
    upload.fields([
        { name: "file", maxCount: 1 },
        { name: "image", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const files = req.files || {};
            const file = (files["file"] || files["image"] || [])[0];

            if (!file) {
                return res.status(400).json({ success: false, message: "No file provided. Use field 'file' or 'image'." });
            }

            const folder = (req.body.folder || "images").replace(/[^a-zA-Z0-9_\-\/]/g, "");
            const origExt = (file.originalname || "image").split(".").pop().toLowerCase() || "jpg";
            
            let processedBuffer = file.buffer;
            let processedMime = file.mimetype || "image/jpeg";
            let finalExt = origExt;

            // Compress & optimize using sharp if image
            if (!file.mimetype?.includes("svg") && !file.mimetype?.includes("gif")) {
                try {
                    processedBuffer = await sharp(file.buffer)
                        .rotate() // Auto-orient via EXIF
                        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
                        .webp({ quality: 82, effort: 4 })
                        .toBuffer();
                    processedMime = "image/webp";
                    finalExt = "webp";
                } catch (sharpErr) {
                    console.warn("⚠️ Sharp image compression failed, using original buffer:", sharpErr.message);
                    processedBuffer = file.buffer;
                }
            }

            const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${finalExt}`;
            const destination = `${folder}/${safeName}`;

            const url = await uploadToGCS(processedBuffer, destination, processedMime);

            return res.status(201).json({
                success: true,
                url,
                imageUrl: url,
                fileUrl: url,
                location: url,
            });
        } catch (error) {
            console.error("❌ /api/upload error:", error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    }
);

module.exports = router;
