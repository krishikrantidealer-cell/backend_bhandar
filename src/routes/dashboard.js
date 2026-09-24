const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { getDashboardStats } = require("../controllers/dashboardController");

// GET /api/dashboard/stats (Admin Only)
router.get("/stats", authMiddleware, adminMiddleware, getDashboardStats);

module.exports = router;
