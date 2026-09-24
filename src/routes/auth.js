const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtp, adminLogin, logout, logoutAll } = require("../controllers/authController");
const { authMiddleware } = require("../middleware/auth");
const { otpRateLimiter } = require("../middleware/rateLimiter");

// POST /api/auth/login
router.post("/login", adminLogin);

// POST /api/auth/send-otp (rate limited)
router.post("/send-otp", otpRateLimiter, sendOtp);

// POST /api/auth/verify-otp
router.post("/verify-otp", verifyOtp);

// POST /api/auth/logout (protected)
router.post("/logout", authMiddleware, logout);

// POST /api/auth/logout-all (protected)
router.post("/logout-all", authMiddleware, logoutAll);

module.exports = router;
