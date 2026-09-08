const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    applyCoupon,
    removeCoupon,
    clearCart
} = require("../controllers/cartController");

// Secure all cart endpoints under authMiddleware
router.use(authMiddleware);

// GET /api/cart              — retrieve customer's cart
router.get("/", getCart);

// POST /api/cart/items        — add item to cart
router.post("/items", addToCart);

// PUT /api/cart/items/:variantIdOrSku    — update item quantity in cart
router.put("/items/:variantIdOrSku", updateCartItem);

// DELETE /api/cart/items/:variantIdOrSku — remove item from cart
router.delete("/items/:variantIdOrSku", removeFromCart);

// POST /api/cart/apply-coupon  — apply coupon code to cart
router.post("/apply-coupon", applyCoupon);

// DELETE /api/cart/coupon     — remove coupon code from cart
router.delete("/coupon", removeCoupon);

// DELETE /api/cart            — clear entire cart
router.delete("/", clearCart);

module.exports = router;
