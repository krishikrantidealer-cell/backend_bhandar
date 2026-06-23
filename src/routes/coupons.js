const express = require("express");
const router = express.Router();
const {
    getAllCoupons,
    getCouponByCode,
    createCoupon
} = require("../controllers/couponController");

// GET /api/coupons        — list all coupons
router.get("/", getAllCoupons);

// POST /api/coupons       — create a new coupon
router.post("/", createCoupon);

// GET /api/coupons/:code  — retrieve coupon details by code
router.get("/:code", getCouponByCode);

module.exports = router;
