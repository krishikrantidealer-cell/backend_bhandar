const express = require("express");
const router = express.Router();
const {
    getAllProducts,
    getProductByHandle,
    getProductsByCategory
} = require("../controllers/productController");

// GET /api/products                        — list all (with pagination & filters)
router.get("/", getAllProducts);

// GET /api/products/category/:categoryId   — products by category
router.get("/category/:categoryId", getProductsByCategory);

// GET /api/products/:handle                — single product by handle
router.get("/:handle", getProductByHandle);

module.exports = router;
