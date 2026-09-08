const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getAllOrders,
    getOrderById,
    getOrdersByCustomer,
    createOrder,
    createRazorpayOrder,
    cancelOrder
} = require("../controllers/orderController");

// GET /api/orders                     — list all (with pagination, search, status filters, protected - admin only)
router.get("/", authMiddleware, adminMiddleware, getAllOrders);

// POST /api/orders/razorpay           — create Razorpay order (protected)
router.post("/razorpay", authMiddleware, createRazorpayOrder);

// POST /api/orders                    — create a new order (protected)
router.post("/", authMiddleware, createOrder);

// GET /api/orders/customer/:emailOrPhone — list orders for a specific customer (protected, self-access or admin)
router.get("/customer/:emailOrPhone", authMiddleware, (req, res, next) => {
    const { emailOrPhone } = req.params;
    const decoded = decodeURIComponent(emailOrPhone).trim();
    if (req.user.role !== "admin" && req.user.phone !== decoded && req.user.email !== decoded) {
        return res.status(403).json({ success: false, message: "Forbidden: Access to another customer's orders is denied" });
    }
    next();
}, getOrdersByCustomer);

// GET /api/orders/:id                 — single order by name (e.g. #18899) or ObjectId (protected)
router.get("/:id", authMiddleware, getOrderById);

// POST /api/orders/:id/cancel         — cancel order (protected)
router.post("/:id/cancel", authMiddleware, cancelOrder);

module.exports = router;
