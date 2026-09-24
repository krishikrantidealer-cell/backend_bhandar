const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory
} = require("../controllers/categoryController");

// Public
router.get("/", getAllCategories);
router.get("/:id", getCategoryById);

// Admin (Protected)
router.post("/", authMiddleware, adminMiddleware, createCategory);
router.put("/:id", authMiddleware, adminMiddleware, updateCategory);
router.delete("/:id", authMiddleware, adminMiddleware, deleteCategory);

module.exports = router;
