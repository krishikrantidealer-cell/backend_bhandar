const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getAllProducts,
    getProductByHandle,
    getProductsByCategory,
    createProduct,
    updateProduct,
    deleteProduct
} = require("../controllers/productController");

// GET /api/products                        — list all (with pagination & filters)
router.get("/", getAllProducts);

// GET /api/products/category/:categoryId   — products by category
router.get("/category/:categoryId", getProductsByCategory);

// GET /api/products/:handle                — single product by handle
router.get("/:handle", getProductByHandle);

// ─── Admin (Protected) ──────────────────────────────────────────────────────────
// POST /api/products                       — create product
router.post("/", authMiddleware, adminMiddleware, createProduct);

// PUT /api/products/:id                    — update product
router.put("/:id", authMiddleware, adminMiddleware, updateProduct);

// DELETE /api/products/:id                 — delete product
router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);

module.exports = router;
