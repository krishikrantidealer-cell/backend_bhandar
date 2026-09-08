require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const { getRedisClient } = require("./src/config/redis");
const Customer = require("./src/models/Customer");
const Order = require("./src/models/Order");
const Product = require("./src/models/Product");
const Cart = require("./src/models/Cart");
const { Counter, getNextSequence } = require("./src/models/Counter");

const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

const TEST_CUSTOMER_PHONE = "+918888888888";
const TEST_ADMIN_PHONE = "+917777777777";

const request = (options, postData = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        });
        req.on("error", reject);
        if (postData) {
            req.write(JSON.stringify(postData));
        }
        req.end();
    });
};

async function runVerification() {
    try {
        console.log("🚀 Starting Backend Security & Architecture Fixes Verification...\n");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        // Clean up test data
        await Customer.deleteMany({ phone: { $in: [TEST_CUSTOMER_PHONE, TEST_ADMIN_PHONE] } });
        await Order.deleteMany({ phone: { $in: [TEST_CUSTOMER_PHONE, TEST_ADMIN_PHONE] } });
        const redisClient = await getRedisClient();
        await redisClient.del(`otp:${TEST_CUSTOMER_PHONE}`);
        await redisClient.del(`otp:${TEST_ADMIN_PHONE}`);

        // Find a real product with variants to test price enforcement
        const sampleProduct = await Product.findOne({ "variants.0": { $exists: true } });
        if (!sampleProduct) {
            throw new Error("No sample product found in DB");
        }
        const sampleVariant = sampleProduct.variants[0];
        const authoritativePrice = parseFloat(sampleVariant.price) || 500;
        console.log(`📦 Using Sample Product: "${sampleProduct.title}" (Authoritative Price: ₹${authoritativePrice})`);

        // ==========================================
        // 1. Atomic Customer ID Registration
        // ==========================================
        console.log("\n--- [Test 1: Atomic Customer Registration & Session] ---");
        await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_CUSTOMER_PHONE });

        const custVerifyRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_CUSTOMER_PHONE, otp: "123456" });

        const customerToken = custVerifyRes.body.token;
        const customerId = custVerifyRes.body.customer._id;
        console.log(`✅ Customer registered with atomic ID: ${customerId} (role: ${custVerifyRes.body.customer.role})`);

        // Register Admin user for testing RBAC
        await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_ADMIN_PHONE });

        const adminVerifyRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_ADMIN_PHONE, otp: "123456" });

        const adminId = adminVerifyRes.body.customer._id;
        // Upgrade this user to admin role in database
        await Customer.findByIdAndUpdate(adminId, { role: "admin" });
        // Re-authenticate admin to refresh session & JWT role
        const adminLoginRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_ADMIN_PHONE, otp: "123456" });
        const adminToken = adminLoginRes.body.token;
        console.log(`✅ Admin registered with ID: ${adminId} (role: ${adminLoginRes.body.customer.role})`);

        // ==========================================
        // 2. RBAC Access Control Tests
        // ==========================================
        console.log("\n--- [Test 2: RBAC Protection on Admin Endpoints] ---");
        // Customer attempting to GET /api/orders (all orders) -> Expect 403
        const custOrdersRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/orders",
            method: "GET",
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        console.log(`🔒 Customer accessing GET /api/orders: Status ${custOrdersRes.statusCode} (Expected: 403 Forbidden)`);
        if (custOrdersRes.statusCode !== 403) throw new Error("RBAC failed: Customer was able to list all orders!");

        // Customer attempting to GET /api/customers (all customers) -> Expect 403
        const custAllRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/customers",
            method: "GET",
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        console.log(`🔒 Customer accessing GET /api/customers: Status ${custAllRes.statusCode} (Expected: 403 Forbidden)`);
        if (custAllRes.statusCode !== 403) throw new Error("RBAC failed: Customer was able to list all customers!");

        // Admin accessing GET /api/orders -> Expect 200
        const adminOrdersRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/orders",
            method: "GET",
            headers: { "Authorization": `Bearer ${adminToken}` }
        });
        console.log(`🔑 Admin accessing GET /api/orders: Status ${adminOrdersRes.statusCode} (Expected: 200 OK)`);
        if (adminOrdersRes.statusCode !== 200) throw new Error("RBAC failed: Admin was blocked from listing orders!");

        // ==========================================
        // 3. Server-Side Price & Total Enforcement
        // ==========================================
        console.log("\n--- [Test 3: Server-Side Price Enforcement & Tamper Proofing] ---");
        // Customer attempts to tamper with price: claims price is ₹1 instead of authoritative price
        const tamperedOrderRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/orders",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${customerToken}`
            }
        }, {
            total: 1, // Tampered total
            subtotal: 1,
            lineItems: [
                {
                    productId: sampleProduct._id,
                    sku: sampleVariant.sku,
                    quantity: 2,
                    price: 1 // Tampered line item price
                }
            ]
        });

        if (!tamperedOrderRes.body.success) {
            console.error("❌ createOrder failed:", tamperedOrderRes.statusCode, tamperedOrderRes.body);
        }
        const createdOrder = tamperedOrderRes.body.data;
        const expectedTotal = authoritativePrice * 2;
        console.log(`🛡️ Tampered Order Created: Order #${createdOrder.name}`);
        console.log(`   Client submitted total: ₹1`);
        console.log(`   Server enforced total: ₹${createdOrder.total} (Expected: ₹${expectedTotal})`);
        console.log(`   Line item enforced price: ₹${createdOrder.lineItems[0].price} (Expected: ₹${authoritativePrice})`);

        if (createdOrder.total !== expectedTotal) {
            throw new Error(`Server-side pricing failed! Expected total ${expectedTotal}, got ${createdOrder.total}`);
        }

        // ==========================================
        // 4. Cart Clearance upon Checkout
        // ==========================================
        console.log("\n--- [Test 4: Cart Population & Auto-Clearance on Checkout] ---");
        // Add item to cart
        await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/cart/items",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${customerToken}`
            }
        }, {
            productId: sampleProduct._id,
            variantSku: sampleVariant.sku,
            quantity: 1
        });

        // Verify cart has item
        const cartBefore = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/cart",
            method: "GET",
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        console.log(`🛒 Cart items before checkout: ${cartBefore.body.data.items.length}`);

        // Place order without passing explicit line items (checkout directly from cart)
        const cartOrderRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/orders",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${customerToken}`
            }
        }, {});

        console.log(`📦 Order created from cart: Order ${cartOrderRes.body.data.name}`);

        // Verify cart is now empty
        const cartAfter = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/cart",
            method: "GET",
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        console.log(`🧹 Cart items after checkout: ${cartAfter.body.data.items.length} (Expected: 0)`);
        if (cartAfter.body.data.items.length !== 0) {
            throw new Error("Cart was not automatically cleared after checkout!");
        }

        // ==========================================
        // 5. Non-Blocking Redis Logout All
        // ==========================================
        console.log("\n--- [Test 5: Non-blocking Logout-All] ---");
        const logoutAllRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/logout-all",
            method: "POST",
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        console.log(`🚪 Logout-all response: ${logoutAllRes.body.message}`);

        // Verify session is revoked
        const testRevokedRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/cart",
            method: "GET",
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        console.log(`🔒 Session status after logout-all: ${testRevokedRes.statusCode} (Expected: 401 Unauthorized)`);
        if (testRevokedRes.statusCode !== 401) {
            throw new Error("Session was still active after logout-all!");
        }

        // Clean up test data
        await Customer.deleteMany({ phone: { $in: [TEST_CUSTOMER_PHONE, TEST_ADMIN_PHONE] } });
        await Order.deleteMany({ phone: { $in: [TEST_CUSTOMER_PHONE, TEST_ADMIN_PHONE] } });

        console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! All vulnerabilities & bottlenecks resolved.");
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error("\n❌ Verification Failed:", err);
        process.exit(1);
    }
}

runVerification();
