const Banner = require("../models/Banner");
const { uploadToGCS } = require("../config/gcs");
let sharp;
try {
    sharp = require("sharp");
} catch (e) {
    // Sharp might require Node >= 20 on certain platforms
}
const fs = require("fs");
const path = require("path");

// ─── GET /api/banners?type=home|category ────────────────────────────────────
const getBanners = async (req, res) => {
    try {
        const { type } = req.query;
        const filter = { isActive: true };
        if (type) filter.type = type;

        const banners = await Banner.find(filter)
            .sort({ order: 1, createdAt: 1 })
            .lean();

        res.json({ success: true, banners });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── POST /api/banners  (Admin: create) ──────────────────────────────────────
const createBanner = async (req, res) => {
    try {
        const { type, title, imageUrl, imageUrlMedium, linkType, linkValue, order, isActive } = req.body;
        const banner = new Banner({ type, title, imageUrl, imageUrlMedium, linkType, linkValue, order, isActive });
        await banner.save();
        res.status(201).json({ success: true, banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── PUT /api/banners/:id  (Admin: update) ───────────────────────────────────
const updateBanner = async (req, res) => {
    try {
        const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!banner) return res.status(404).json({ success: false, message: "Banner not found" });
        res.json({ success: true, banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── DELETE /api/banners/:id  (Admin: delete) ────────────────────────────────
const deleteBanner = async (req, res) => {
    try {
        const banner = await Banner.findByIdAndDelete(req.params.id);
        if (!banner) return res.status(404).json({ success: false, message: "Banner not found" });
        res.json({ success: true, message: "Banner deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── POST /api/banners/upload  (Admin: upload image + create banner) ─────────
const uploadBannerImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided" });
        }
        const { type, title, linkType, linkValue, order } = req.body;
        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname) || ".jpg";
        const baseName = `banners/${type || "home"}/${timestamp}`;

        // Full-size optimized image
        const fullBuffer = await sharp(req.file.buffer)
            .webp({ quality: 85 })
            .toBuffer();
        const fullUrl = await uploadToGCS(fullBuffer, `${baseName}_full.webp`, "image/webp");

        // Medium-size thumbnail (for progressive loading)
        const medBuffer = await sharp(req.file.buffer)
            .resize({ width: 400 })
            .webp({ quality: 60 })
            .toBuffer();
        const medUrl = await uploadToGCS(medBuffer, `${baseName}_med.webp`, "image/webp");

        const banner = new Banner({
            type: type || "home",
            title: title || "",
            imageUrl: fullUrl,
            imageUrlMedium: medUrl,
            linkType: linkType || "none",
            linkValue: linkValue || "",
            order: order ? parseInt(order) : 0,
        });
        await banner.save();

        res.status(201).json({ success: true, banner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── POST /api/banners/seed  (One-time seed from local asset paths) ──────────
// Body: { banners: [ { type, title, localPath, linkType, linkValue, order } ] }
const seedBanners = async (req, res) => {
    try {
        const { banners: seedList } = req.body;
        if (!seedList || !Array.isArray(seedList)) {
            return res.status(400).json({ success: false, message: "Provide banners array" });
        }

        const results = [];
        for (const item of seedList) {
            const { type, title, imageUrl, imageUrlMedium, linkType, linkValue, order } = item;
            // Upsert: avoid duplicates if seed is run again
            const existing = await Banner.findOne({ imageUrl });
            if (existing) {
                results.push({ skipped: true, title, imageUrl });
                continue;
            }
            const banner = new Banner({ type, title, imageUrl, imageUrlMedium: imageUrlMedium || "", linkType: linkType || "none", linkValue: linkValue || "", order: order || 0 });
            await banner.save();
            results.push({ created: true, title, imageUrl });
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getBanners, createBanner, updateBanner, deleteBanner, uploadBannerImage, seedBanners };
