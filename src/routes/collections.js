const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getCollections,
    getCollectionBySlug,
    createCollection,
    updateCollection,
    deleteCollection
} = require("../controllers/collectionController");

// Public
router.get("/", getCollections);
router.get("/:slug", getCollectionBySlug);

// Admin (Protected)
router.post("/", authMiddleware, adminMiddleware, createCollection);
router.put("/:id", authMiddleware, adminMiddleware, updateCollection);
router.delete("/:id", authMiddleware, adminMiddleware, deleteCollection);

module.exports = router;
