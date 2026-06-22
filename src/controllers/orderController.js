const Order = require("../models/Order");
const mongoose = require("mongoose");

// GET /api/orders
// Query params: ?page=1&limit=20&search=<text>&financialStatus=<status>&fulfillmentStatus=<status>
const getAllOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, financialStatus, fulfillmentStatus } = req.query;

        const filter = {};
        if (financialStatus) filter.financialStatus = financialStatus;
        if (fulfillmentStatus) filter.fulfillmentStatus = fulfillmentStatus;
        if (search) filter.$text = { $search: search };

        const skip = (Number(page) - 1) * Number(limit);

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Order.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: orders
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/orders/:id
// Can query by order name (e.g. #18899) or MongoDB ObjectId
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        let order;

        if (mongoose.Types.ObjectId.isValid(id)) {
            order = await Order.findById(id);
        } else {
            // Encode/decode just in case of special characters like '#'
            const decodedId = decodeURIComponent(id);
            order = await Order.findOne({ name: decodedId });
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        res.json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/orders/customer/:emailOrPhone
const getOrdersByCustomer = async (req, res) => {
    try {
        const { emailOrPhone } = req.params;
        const decoded = decodeURIComponent(emailOrPhone).trim();

        // Search by email OR phone number
        const filter = {
            $or: [
                { email: decoded },
                { phone: decoded },
                { "billingAddress.phone": decoded },
                { "shippingAddress.phone": decoded }
            ]
        };

        const orders = await Order.find(filter).sort({ createdAt: -1 });

        res.json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/orders
const createOrder = async (req, res) => {
    try {
        const orderData = req.body;

        // Auto-generate order name (#number) if not provided
        if (!orderData.name) {
            const orders = await Order.find({ name: /^#/ }).select("name");
            let nextNum = 19000;
            if (orders.length > 0) {
                const nums = orders
                    .map(o => parseInt(o.name.replace("#", ""), 10))
                    .filter(n => !isNaN(n));
                if (nums.length > 0) {
                    nextNum = Math.max(...nums) + 1;
                }
            }
            orderData.name = `#${nextNum}`;
        }

        // Derive order status if not explicitly provided
        if (!orderData.status) {
            if (orderData.cancelledAt) {
                orderData.status = "cancelled";
            } else if ((orderData.financialStatus || "").toLowerCase() === "refunded") {
                orderData.status = "refunded";
            } else if ((orderData.fulfillmentStatus || "").toLowerCase() === "fulfilled") {
                orderData.status = "completed";
            } else if ((orderData.financialStatus || "").toLowerCase() === "paid") {
                orderData.status = "processing";
            } else {
                orderData.status = "pending";
            }
        }

        // Set default timestamps
        if (!orderData.createdAt) {
            orderData.createdAt = new Date();
        }

        const newOrder = new Order(orderData);
        await newOrder.save();

        res.status(201).json({ success: true, data: newOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getAllOrders, getOrderById, getOrdersByCustomer, createOrder };
