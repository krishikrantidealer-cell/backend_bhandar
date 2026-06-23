const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtp, logout, logoutAll } = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

// POST /api/auth/send-otp
router.post("/send-otp", sendOtp);

// POST /api/auth/verify-otp
router.post("/verify-otp", verifyOtp);

// POST /api/auth/logout (protected)
router.post("/logout", authMiddleware, logout);

// POST /api/auth/logout-all (protected)
router.post("/logout-all", authMiddleware, logoutAll);

module.exports = router;
