const Order = require("../models/Order");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const Cart = require("../models/Cart");
const Customer = require("../models/Customer");
const { getNextSequence } = require("../models/Counter");
const mongoose = require("mongoose");
const crypto = require("crypto");

// Helper to verify and calculate order items & totals from DB
async function calculateOrderTotals(lineItemsInput, couponCodeInput) {
    let subtotal = 0;
    const verifiedLineItems = [];

    for (const item of lineItemsInput) {
        let price = Number(item.price) || 0;
        let name = item.name || "Item";
        let sku = item.sku || item.variantSku || "";
        let productId = item.productId || null;
        let quantity = Math.max(1, Number(item.quantity) || 1);

        // Authoritative verification against Product database if productId provided
        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            const product = await Product.findById(productId);
            if (product) {
                name = product.title;
                let variant;
                if (sku) {
                    variant = product.variants.find(v => v.sku === sku);
                }
                if (!variant && item.variantId) {
                    variant = product.variants.find(v => v._id && v._id.toString() === item.variantId.toString());
                }
                if (!variant && product.variants.length > 0) {
                    variant = product.variants[0];
                }
                if (variant) {
                    price = parseFloat(variant.price) || 0;
                    sku = variant.sku || sku;
                }
            }
        }

        const itemTotal = price * quantity;
        subtotal += itemTotal;

        verifiedLineItems.push({
            productId,
            name,
            sku,
            price,
            quantity,
            requiresShipping: item.requiresShipping !== false,
            taxable: !!item.taxable,
            fulfillmentStatus: "pending",
            discount: Number(item.discount) || 0
        });
    }

    // Coupon verification
    let discountAmount = 0;
    let validCouponCode = "";
    if (couponCodeInput) {
        const coupon = await Coupon.findOne({ code: couponCodeInput.toUpperCase().trim() });
        if (coupon && coupon.status === "active") {
            const now = new Date();
            const startValid = coupon.startDate <= now;
            const endValid = !coupon.endDate || coupon.endDate >= now;

            if (startValid && endValid && subtotal >= coupon.minimumPurchase) {
                if (coupon.valueType === "percentage") {
                    discountAmount = subtotal * (coupon.value / 100);
                } else if (coupon.valueType === "fixed_amount") {
                    discountAmount = coupon.value;
                }
                if (discountAmount > subtotal) discountAmount = subtotal;
                validCouponCode = coupon.code;
            }
        }
    }

    const total = Math.max(0, subtotal - discountAmount);

    return {
        subtotal,
        discountAmount,
        total,
        validCouponCode,
        verifiedLineItems
    };
}

// GET /api/orders (Protected: Admin Only)
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
// Protected: Accessible to Order Owner or Admin
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        let order;

        if (mongoose.Types.ObjectId.isValid(id)) {
            order = await Order.findById(id);
        } else {
            const decodedId = decodeURIComponent(id);
            order = await Order.findOne({ name: decodedId });
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const isAdmin = req.user && req.user.role === "admin";
        const isOwner = (order.email && order.email === req.user.email) ||
            (order.phone && order.phone === req.user.phone);

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden: Access to this order is denied" });
        }

        res.json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/orders/customer/:emailOrPhone
// Protected: Accessible to Self or Admin
const getOrdersByCustomer = async (req, res) => {
    try {
        const { emailOrPhone } = req.params;
        const decoded = decodeURIComponent(emailOrPhone).trim();

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

// POST /api/orders/razorpay
// Protected: Generates Razorpay Order using server-verified cart amount
const createRazorpayOrder = async (req, res) => {
    try {
        let amountToCharge = 0;

        // 1. If explicit lineItems/cart passed or fetch from customer's active cart in DB
        let cart = await Cart.findOne({ customerId: req.user.id });
        if (cart && cart.items && cart.items.length > 0) {
            const { total } = await calculateOrderTotals(cart.items, cart.couponCode);
            amountToCharge = total;
        } else if (req.body.lineItems && req.body.lineItems.length > 0) {
            const { total } = await calculateOrderTotals(req.body.lineItems, req.body.couponCode);
            amountToCharge = total;
        } else if (req.body.amount && Number(req.body.amount) > 0) {
            // Fallback for custom amounts if no cart items
            amountToCharge = Number(req.body.amount);
        }

        if (!amountToCharge || amountToCharge <= 0) {
            return res.status(400).json({ success: false, message: "Invalid order amount or empty cart" });
        }

        const amountInPaise = Math.round(amountToCharge * 100);
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
            res.json({ success: true, keyId, order: data, amount: amountToCharge });
        } else {
            res.status(response.status).json({ success: false, message: data.error ? data.error.description : "Razorpay error" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/orders
// Protected: Server-side verified price calculation, atomic order number, stock update, and cart clearance
const createOrder = async (req, res) => {
    try {
        const orderData = req.body;

        // Auto-associate authenticated user phone/email
        if (req.user) {
            if (!orderData.phone && req.user.phone) orderData.phone = req.user.phone;
            if (!orderData.email && req.user.email) orderData.email = req.user.email;
        }

        // Determine line items: from body or from customer's active Cart
        let itemsToProcess = orderData.lineItems;
        let couponCodeToApply = orderData.couponCode || "";

        if (!itemsToProcess || itemsToProcess.length === 0) {
            const customerCart = await Cart.findOne({ customerId: req.user.id });
            if (customerCart && customerCart.items.length > 0) {
                itemsToProcess = customerCart.items;
                couponCodeToApply = customerCart.couponCode || couponCodeToApply;
            }
        }

        if (!itemsToProcess || itemsToProcess.length === 0) {
            return res.status(400).json({ success: false, message: "Cannot create order with empty line items" });
        }

        // 1. Server-side authoritative calculation
        const {
            subtotal,
            discountAmount,
            total,
            verifiedLineItems
        } = await calculateOrderTotals(itemsToProcess, couponCodeToApply);

        orderData.lineItems = verifiedLineItems;
        orderData.subtotal = subtotal;
        orderData.discountAmount = discountAmount;
        orderData.total = total;

        // 2. Razorpay signature verification
        if (orderData.paymentMethod === "Online" || orderData.paymentMethod === "razorpay") {
            const keySecret = process.env.RAZORPAY_KEY_SECRET;
            if (!orderData.razorpayOrderId || !orderData.razorpayPaymentId || !orderData.razorpaySignature) {
                return res.status(400).json({ success: false, message: "Missing Razorpay payment parameters" });
            }

            if (!keySecret) {
                return res.status(500).json({ success: false, message: "Razorpay secret key not configured on server" });
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

        // 3. Atomically generate order name (#seq) without table scans
        if (!orderData.name) {
            const nextSeq = await getNextSequence("orderNumber", 19000);
            orderData.name = `#${nextSeq}`;
        }

        // 4. Derive status
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

        // 5. Execute Order creation, stock decrement, and customer update in an ACID MongoDB Transaction
        const session = await mongoose.startSession();
        let sessionActive = false;
        try {
            session.startTransaction();
            sessionActive = true;
        } catch (_) {
            sessionActive = false;
        }

        let newOrder;
        try {
            const opts = sessionActive ? { session } : {};

            newOrder = new Order(orderData);
            await newOrder.save(opts);

            // 6. Atomically decrement stock for products with optimistic concurrency
            for (const item of verifiedLineItems) {
                if (item.productId && item.sku) {
                    try {
                        await Product.updateOne(
                            { _id: item.productId, "variants.sku": item.sku },
                            { $inc: { "variants.$.stock": -item.quantity } },
                            opts
                        );
                    } catch (stockErr) {
                        console.error("Stock decrement error:", stockErr.message);
                    }
                }
            }

            // 7. Clear user's cart in DB & update customer stats
            if (req.user && req.user.id) {
                await Cart.findOneAndUpdate(
                    { customerId: req.user.id },
                    { items: [], couponCode: "", subtotal: 0, discountAmount: 0, total: 0 },
                    opts
                );

                await Customer.findByIdAndUpdate(
                    req.user.id,
                    { $inc: { totalOrders: 1, totalSpent: total } },
                    opts
                );
            }

            // 8. Increment Coupon usage
            if (validCouponCode) {
                await Coupon.updateOne(
                    { code: validCouponCode },
                    { $inc: { usageCount: 1 } },
                    opts
                );
            }

            if (sessionActive) {
                await session.commitTransaction();
            }
        } catch (trxErr) {
            if (sessionActive) {
                await session.abortTransaction();
            }
            throw trxErr;
        } finally {
            session.endSession();
        }

        res.status(201).json({ success: true, data: newOrder });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/orders/:id/cancel
const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const isAdmin = req.user && req.user.role === "admin";
        const isOwner = (order.email && order.email === req.user.email) ||
            (order.phone && order.phone === req.user.phone);

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden: Access to cancel this order is denied" });
        }

        if (order.status === "cancelled") {
            return res.status(400).json({ success: false, message: "Order is already cancelled" });
        }

        order.status = "cancelled";
        order.cancelledAt = new Date();
        await order.save();

        // Restore stock
        for (const item of order.lineItems) {
            if (item.productId && item.sku) {
                try {
                    const product = await Product.findById(item.productId);
                    if (product && product.variants) {
                        const vIndex = product.variants.findIndex(v => v.sku === item.sku);
                        if (vIndex > -1) {
                            const currentStock = parseInt(product.variants[vIndex].stock, 10) || 0;
                            product.variants[vIndex].stock = currentStock + item.quantity;
                            await product.save();
                        }
                    }
                } catch (stockErr) {
                    console.error("Stock restore error:", stockErr.message);
                }
            }
        }

        res.json({ success: true, message: "Order cancelled successfully", data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// POST /api/orders/webhook or /api/webhooks/razorpay
// Zero-loss payment webhook handler for Razorpay
const handleRazorpayWebhook = async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        if (webhookSecret && signature) {
            const shasum = crypto.createHmac("sha256", webhookSecret);
            shasum.update(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
            const digest = shasum.digest("hex");
            if (digest !== signature) {
                console.warn("⚠️ Razorpay Webhook Signature Mismatch");
                return res.status(400).json({ success: false, message: "Invalid webhook signature" });
            }
        }

        const event = req.body?.event;
        const payload = req.body?.payload;

        if (!event || !payload) {
            return res.status(200).json({ status: "ok", message: "Ignored empty payload" });
        }

        console.log(`🔔 [Razorpay Webhook] Received event: ${event}`);

        if (event === "payment.captured" || event === "order.paid") {
            const paymentEntity = payload.payment?.entity;
            const razorpayOrderId = paymentEntity?.order_id;
            const razorpayPaymentId = paymentEntity?.id;

            if (razorpayOrderId || razorpayPaymentId) {
                const order = await Order.findOne({
                    $or: [
                        { razorpayOrderId: razorpayOrderId },
                        { razorpayPaymentId: razorpayPaymentId }
                    ]
                });

                if (order) {
                    let shouldSave = false;
                    if (order.financialStatus !== "paid") {
                        order.financialStatus = "paid";
                        order.status = "processing";
                        shouldSave = true;
                    }
                    if (razorpayPaymentId && (!order.razorpayPaymentId || order.razorpayPaymentId !== razorpayPaymentId)) {
                        order.razorpayPaymentId = razorpayPaymentId;
                        shouldSave = true;
                    }
                    if (shouldSave) {
                        await order.save();
                        console.log(`✅ [Razorpay Webhook] Updated order ${order.name} to paid.`);
                    }
                }
            }
        } else if (event === "payment.failed") {
            const paymentEntity = payload.payment?.entity;
            const razorpayOrderId = paymentEntity?.order_id;

            if (razorpayOrderId) {
                const order = await Order.findOne({ razorpayOrderId });
                if (order && order.financialStatus !== "paid") {
                    order.financialStatus = "failed";
                    await order.save();
                    console.log(`❌ [Razorpay Webhook] Marked order ${order.name} payment as failed.`);
                }
            }
        }

        res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("Razorpay webhook error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/orders/:id (Admin: update order status/fulfillment)
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, financialStatus, fulfillmentStatus, notes } = req.body;

        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            const decodedId = decodeURIComponent(id);
            query = { name: decodedId };
        }

        const updateFields = {};
        if (status) updateFields.status = status;
        if (financialStatus) updateFields.financialStatus = financialStatus;
        if (fulfillmentStatus) updateFields.fulfillmentStatus = fulfillmentStatus;
        if (notes !== undefined) updateFields.notes = notes;

        const order = await Order.findOneAndUpdate(query, { $set: updateFields }, { new: true });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        res.json({ success: true, order, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllOrders,
    getOrderById,
    getOrdersByCustomer,
    createOrder,
    createRazorpayOrder,
    cancelOrder,
    handleRazorpayWebhook,
    updateOrderStatus
};

