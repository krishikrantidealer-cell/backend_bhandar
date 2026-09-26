const express = require("express");
const router = express.Router();
const multer = require("multer");
const { uploadToGCS } = require("../config/gcs");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");

// In-memory multer — no disk writes, upload directly to GCS
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
});

/**
 * POST /api/upload
 * Generic image upload to Krishi Bhandar GCS bucket.
 * Accepts: multipart/form-data with field "file" or "image"
 * Body field "folder" (optional, default: "images") — sets the bucket folder prefix.
 * Returns: { success: true, url: "https://storage.googleapis.com/..." }
 */
router.post(
    "/",
    authMiddleware,
    adminMiddleware,
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
            const ext = (file.originalname || "image").split(".").pop().toLowerCase() || "jpg";
            const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const destination = `${folder}/${safeName}`;

            const url = await uploadToGCS(file.buffer, destination, file.mimetype || "image/jpeg");

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
