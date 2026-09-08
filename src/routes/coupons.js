const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getAllCoupons,
    getCouponByCode,
    createCoupon
} = require("../controllers/couponController");

// GET /api/coupons        — list all coupons (public)
router.get("/", getAllCoupons);

// POST /api/coupons       — create a new coupon (admin only)
router.post("/", authMiddleware, adminMiddleware, createCoupon);

// GET /api/coupons/:code  — retrieve coupon details by code (public)
router.get("/:code", getCouponByCode);

module.exports = router;
