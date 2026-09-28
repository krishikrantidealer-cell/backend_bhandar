const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware, optionalAuthMiddleware } = require("../middleware/auth");
const {
    getAllOrders,
    getOrderById,
    getOrdersByCustomer,
    createOrder,
    createRazorpayOrder,
    cancelOrder,
    handleRazorpayWebhook,
    updateOrderStatus
} = require("../controllers/orderController");

// GET /api/orders                     — list all (with pagination, search, status filters, protected - admin only)
router.get("/", authMiddleware, adminMiddleware, getAllOrders);

// PUT /api/orders/:id                 — update order status / notes (protected - admin only)
router.put("/:id", authMiddleware, adminMiddleware, updateOrderStatus);

// POST /api/orders/webhook           — Razorpay Webhook handler (public callback with signature verification)
router.post("/webhook", handleRazorpayWebhook);

// POST /api/orders/razorpay           — create Razorpay order (supports guest/customer/auth)
router.post("/razorpay", optionalAuthMiddleware, createRazorpayOrder);

// POST /api/orders                    — create a new order (supports guest/customer/auth)
router.post("/", optionalAuthMiddleware, createOrder);

// GET /api/orders/customer/:emailOrPhone — list orders for a specific customer
router.get("/customer/:emailOrPhone", optionalAuthMiddleware, (req, res, next) => {
    const { emailOrPhone } = req.params;
    const decoded = decodeURIComponent(emailOrPhone).trim();
    if (req.user && req.user.role !== "admin" && req.user.phone && req.user.phone !== decoded && req.user.email && req.user.email !== decoded) {
        return res.status(403).json({ success: false, message: "Forbidden: Access to another customer's orders is denied" });
    }
    next();
}, getOrdersByCustomer);

// GET /api/orders/:id                 — single order by name (e.g. #18899) or ObjectId
router.get("/:id", optionalAuthMiddleware, getOrderById);

// POST /api/orders/:id/cancel         — cancel order
router.post("/:id/cancel", optionalAuthMiddleware, cancelOrder);

module.exports = router;
