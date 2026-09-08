require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const { getRedisClient } = require("./src/config/redis");
const Customer = require("./src/models/Customer");
const Order = require("./src/models/Order");

const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

const TEST_PHONE = "+919999999999";
const ADMIN_PHONE = "+919098544263"; // Ram's phone in DB

const request = (options, postData = null) => {
    return new Promise((resolve, reject) => {
        const headers = { ...(options.headers || {}) };
        let payload = null;
        if (postData) {
            payload = JSON.stringify(postData);
            headers["Content-Length"] = Buffer.byteLength(payload);
        }
        const req = http.request({ ...options, headers }, (res) => {
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
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
};

async function verifyAuth() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

        // Clean up previous test entries in Redis
        const redisClient = await getRedisClient();
        await redisClient.del(`otp:${TEST_PHONE}`);
        await Customer.deleteMany({ phone: TEST_PHONE });
        await Order.deleteMany({ phone: TEST_PHONE });

        // 1. Send OTP
        console.log(`\n1. Sending OTP to ${TEST_PHONE}...`);
        const sendOtpRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_PHONE });

        // Get OTP from response or Redis fallback
        let otpCode = sendOtpRes.body && sendOtpRes.body.code;
        if (!otpCode) {
            otpCode = await redisClient.get(`otp:${TEST_PHONE}`);
        }
        console.log(`🔑 Retrieved OTP code: ${otpCode}`);

        // 2. Verify OTP (creates customer & active session)
        console.log("\n2. Verifying OTP (expecting new customer registration & active session)...");
        const verifyRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_PHONE, otp: otpCode });

        const token = verifyRes.body.token;
        const customerId = verifyRes.body.customer._id;
        console.log(`Registered Customer ID: ${customerId}`);

        // Verify session document exists in Redis
        const sessionDoc = await redisClient.get(`session:${token}`);
        console.log(`Session doc found in local client lookup: ${!!sessionDoc} (Expected false for separate process in-memory fallback, true for real Redis)`);

        // 3. Create an order with the correct token (should auto-associate with TEST_PHONE)
        console.log("\n3. Creating order with the authenticated user...");
        const createOrderRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/orders",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        }, {
            total: 500,
            lineItems: [{ name: "Secured Test Product", quantity: 1, price: 500 }]
        });
        const orderName = createOrderRes.body.data?.name;
        console.log(`Created Order Name: ${orderName}, Phone on Order: ${createOrderRes.body.data?.phone}`);

        // 4. Retrieve this order with our token (should work)
        console.log(`\n4. Fetching order ${orderName} using OWN token...`);
        const getOrderRes = await request({
            hostname: "localhost",
            port: 8000,
            path: `/api/orders/${encodeURIComponent(orderName)}`,
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        console.log(`Status: ${getOrderRes.statusCode} (Expected: 200)`);
        console.log(`Data Name: ${getOrderRes.body.data?.name}`);

        // 5. Query another customer's order (e.g. order #18869 which belongs to Shabir) (should return 403 Forbidden)
        console.log("\n5. Querying order #18869 (belongs to another customer) with our token...");
        const forbiddenOrderRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/orders/%2318869",
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        console.log(`Status: ${forbiddenOrderRes.statusCode} (Expected: 403)`);
        console.log(`Message: ${forbiddenOrderRes.body.message}`);

        // 6. Test session revocation (Logout)
        console.log("\n6. Logging out (revoking session in database)...");
        const logoutRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/logout",
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        console.log(`Logout Status: ${logoutRes.statusCode}, Message: ${logoutRes.body.message}`);

        // 7. Try fetching the cart again with the revoked token (should return 401 Unauthorized)
        console.log("\n7. Attempting to fetch cart with the logged-out token...");
        const cartRevoked = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/cart",
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        console.log(`Status: ${cartRevoked.statusCode} (Expected: 401)`);
        console.log(`Message: ${cartRevoked.body.message}`);

        await mongoose.connection.close();
        console.log("\n✅ Session Management & API Securing Verification finished successfully!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Verification error:", e);
        process.exit(1);
    }
}

verifyAuth();
