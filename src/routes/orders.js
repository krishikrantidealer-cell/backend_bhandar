const express = require("express");
const router = express.Router();
const {
    getAllOrders,
    getOrderById,
    getOrdersByCustomer,
    createOrder
} = require("../controllers/orderController");

// GET /api/orders                     — list all (with pagination, search, status filters)
router.get("/", getAllOrders);

// POST /api/orders                    — create a new order
router.post("/", createOrder);

// GET /api/orders/customer/:emailOrPhone — list orders for a specific customer email or phone
router.get("/customer/:emailOrPhone", getOrdersByCustomer);

// GET /api/orders/:id                 — single order by name (e.g. #18899) or ObjectId
router.get("/:id", getOrderById);

module.exports = router;
