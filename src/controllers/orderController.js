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

        // Verify that the order belongs to the logged-in user
        // (Either matching their email or matching their phone number)
        const isOwner = (order.email && order.email === req.user.email) ||
            (order.phone && order.phone === req.user.phone);

        if (!isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden: Access to this order is denied" });
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

        // Auto-associate with authenticated user details if missing
        if (req.user) {
            if (!orderData.phone && req.user.phone) orderData.phone = req.user.phone;
        }

        // Razorpay signature verification
        if (orderData.paymentMethod === "Online" || orderData.paymentMethod === "razorpay") {
            const crypto = require("crypto");
            const keySecret = process.env.RAZORPAY_KEY_SECRET;
            if (!orderData.razorpayOrderId || !orderData.razorpayPaymentId || !orderData.razorpaySignature) {
                return res.status(400).json({ success: false, message: "Missing Razorpay payment parameters" });
            }

            const expectedSignature = crypto
                .createHmac("sha256", keySecret)
                .update(orderData.razorpayOrderId + "|" + orderData.razorpayPaymentId)
                .digest("hex");

            if (expectedSignature !== orderData.razorpaySignature) {
                return res.status(400).json({ success: false, message: "Security Alert: Razorpay signature verification failed" });
            }

            orderData.financialStatus = "paid";
            orderData.status = "processing";
        }

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

// POST /api/orders/razorpay
const createRazorpayOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount) {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }

        const amountInPaise = Math.round(Number(amount) * 100);
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            return res.status(500).json({ success: false, message: "Razorpay credentials not configured on server" });
        }

        const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
        const response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
                "Authorization": `Basic ${auth}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                amount: amountInPaise,
                currency: "INR",
                receipt: `rcpt_ORD_${Date.now().toString().slice(-6)}`
            })
        });

        const data = await response.json();
        if (response.ok) {
            res.json({ success: true, keyId, order: data });
        } else {
            res.status(response.status).json({ success: false, message: data.error ? data.error.description : "Razorpay error" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        // check ownership
        const isOwner = (order.email && order.email === req.user.email) ||
            (order.phone && order.phone === req.user.phone);
        if (!isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        order.status = "cancelled";
        order.cancelledAt = new Date();
        await order.save();
        res.json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getAllOrders, getOrderById, getOrdersByCustomer, createOrder, createRazorpayOrder, cancelOrder };
