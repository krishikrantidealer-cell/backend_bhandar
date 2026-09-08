const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner,
    uploadBannerImage,
    seedBanners,
} = require("../controllers/bannerController");

// In-memory multer for GCS upload (no disk writes needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Public ───────────────────────────────────────────────────────────────────
// GET /api/banners?type=home    → home carousel banners
// GET /api/banners?type=category → category grid banners
// GET /api/banners              → all active banners
router.get("/", getBanners);

// ─── Admin (Protected: Admin Only) ───────────────────────────────────────────
// POST /api/banners              → create banner (provide imageUrl manually)
router.post("/", authMiddleware, adminMiddleware, createBanner);

// POST /api/banners/upload        → upload image to GCS + create banner
router.post("/upload", authMiddleware, adminMiddleware, upload.single("image"), uploadBannerImage);

// POST /api/banners/seed          → seed banners with pre-existing imageUrls
router.post("/seed", authMiddleware, adminMiddleware, seedBanners);

// PUT  /api/banners/:id           → update banner
router.put("/:id", authMiddleware, adminMiddleware, updateBanner);

// DELETE /api/banners/:id         → delete banner
router.delete("/:id", authMiddleware, adminMiddleware, deleteBanner);

module.exports = router;
