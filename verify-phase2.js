require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const { getRedisClient } = require("./src/config/redis");
const Customer = require("./src/models/Customer");
const Banner = require("./src/models/Banner");
const Coupon = require("./src/models/Coupon");

const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

const TEST_USER_PHONE = "+916666666666";
const TEST_ADMIN_PHONE = "+915555555555";
const RATE_LIMIT_TEST_PHONE = "+914444444444";

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

async function runPhase2Verification() {
    try {
        console.log("🚀 Starting Phase 2 Backend Hardening & Features Verification...\n");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        const redisClient = await getRedisClient();
        await Customer.deleteMany({ phone: { $in: [TEST_USER_PHONE, TEST_ADMIN_PHONE, RATE_LIMIT_TEST_PHONE] } });
        await Banner.deleteMany({ title: "Test Admin Banner" });
        await Coupon.deleteMany({ code: "TESTADMIN50" });

        await redisClient.del(`ratelimit:cooldown:${RATE_LIMIT_TEST_PHONE}`);
        await redisClient.del(`ratelimit:count:${RATE_LIMIT_TEST_PHONE}`);
        await redisClient.del(`otp:${RATE_LIMIT_TEST_PHONE}`);

        // Setup Customer
        await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json", "x-bypass-ratelimit": "true" }
        }, { phone: TEST_USER_PHONE });

        const userLoginRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_USER_PHONE, otp: "123456" });

        const userToken = userLoginRes.body.token;
        const userId = userLoginRes.body.customer._id;

        // Setup Admin
        await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json", "x-bypass-ratelimit": "true" }
        }, { phone: TEST_ADMIN_PHONE });

        const adminLoginRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_ADMIN_PHONE, otp: "123456" });

        const adminId = adminLoginRes.body.customer._id;
        await Customer.findByIdAndUpdate(adminId, { role: "admin" });

        // Re-login Admin for admin JWT
        const adminAuthRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/verify-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: TEST_ADMIN_PHONE, otp: "123456" });
        const adminToken = adminAuthRes.body.token;

        // ==========================================
        // Test 1: Banner & Coupon Admin Protection
        // ==========================================
        console.log("\n--- [Test 1: Admin Protection on Banners & Coupons] ---");
        // Regular user attempts to create banner -> 403
        const custBannerRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/banners",
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` }
        }, { title: "Test Admin Banner", imageUrl: "https://example.com/banner.jpg" });

        console.log(`🔒 Customer creating banner: Status ${custBannerRes.statusCode} (Expected: 403 Forbidden)`);
        if (custBannerRes.statusCode !== 403) throw new Error("Customer was improperly allowed to create a banner!");

        // Regular user attempts to create coupon -> 403
        const custCouponRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/coupons",
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` }
        }, { code: "TESTADMIN50", value: 50, valueType: "percentage", minimumPurchase: 100 });

        console.log(`🔒 Customer creating coupon: Status ${custCouponRes.statusCode} (Expected: 403 Forbidden)`);
        if (custCouponRes.statusCode !== 403) throw new Error("Customer was improperly allowed to create a coupon!");

        // Admin creates banner -> 201
        const adminBannerRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/banners",
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminToken}` }
        }, { title: "Test Admin Banner", type: "home", imageUrl: "https://example.com/banner.jpg" });

        console.log(`🔑 Admin creating banner: Status ${adminBannerRes.statusCode} (Expected: 201 Created)`);
        if (adminBannerRes.statusCode !== 201) throw new Error("Admin banner creation failed!");

        // ==========================================
        // Test 2: OTP Rate Limiter & Cooldown
        // ==========================================
        console.log("\n--- [Test 2: OTP Rate Limiting & Cooldown Protection] ---");
        const firstOtp = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: RATE_LIMIT_TEST_PHONE });

        console.log(`⏱️ 1st OTP Request Status: ${firstOtp.statusCode} (Expected: 200)`);
        if (firstOtp.statusCode !== 200) throw new Error("1st OTP request failed!");

        // Immediate 2nd OTP request -> Expect 429 Cooldown
        const secondOtp = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/auth/send-otp",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, { phone: RATE_LIMIT_TEST_PHONE });

        console.log(`🛑 2nd Immediate OTP Request Status: ${secondOtp.statusCode} (Expected: 429 Too Many Requests)`);
        console.log(`   Message: "${secondOtp.body.message}"`);
        if (secondOtp.statusCode !== 429) throw new Error("Rate limiting failed to block consecutive OTP request!");

        // ==========================================
        // Test 3: Customer Profile & Multi-Address
        // ==========================================
        console.log("\n--- [Test 3: Customer Profile Update & Address Book] ---");
        // Update customer profile
        const updateProfRes = await request({
            hostname: "localhost",
            port: 8000,
            path: `/api/customers/${userId}`,
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` }
        }, { firstName: "Ramesh", lastName: "Patel", email: "ramesh.patel@example.com" });

        console.log(`👤 Customer profile updated: ${updateProfRes.body.data?.firstName} ${updateProfRes.body.data?.lastName}`);
        if (updateProfRes.body.data?.firstName !== "Ramesh") throw new Error("Profile update failed!");

        // Add an address
        const addAddrRes = await request({
            hostname: "localhost",
            port: 8000,
            path: `/api/customers/${userId}/addresses`,
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` }
        }, {
            name: "Farm Warehouse",
            address1: "Plot 42, Green Valley Farm Road",
            city: "Indore",
            province: "Madhya Pradesh",
            zip: "452001",
            isDefault: true
        });

        console.log(`📍 Address added: Count = ${addAddrRes.body.data?.length}`);
        if (addAddrRes.statusCode !== 201 || addAddrRes.body.data?.length === 0) {
            throw new Error("Add address failed!");
        }

        // Fetch /me
        const meRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/customers/me",
            method: "GET",
            headers: { "Authorization": `Bearer ${userToken}` }
        });

        console.log(`ℹ️ Fetch /api/customers/me: Name = "${meRes.body.data?.firstName} ${meRes.body.data?.lastName}", Default City = "${meRes.body.data?.defaultAddress?.city}"`);
        if (meRes.body.data?.defaultAddress?.city !== "Indore") throw new Error("Default address sync failed!");

        // ==========================================
        // Test 4: Product Sorting & Search
        // ==========================================
        console.log("\n--- [Test 4: Product Sorting & Search] ---");
        const sortRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/products?sort=price_asc&limit=5",
            method: "GET"
        });

        console.log(`📊 Sorted Products (price_asc) received: ${sortRes.body.data?.length} products`);
        if (sortRes.body.data?.length > 0) {
            console.log(`   First product price: ₹${sortRes.body.data[0].variants?.[0]?.price || 'N/A'}`);
        }

        const searchRes = await request({
            hostname: "localhost",
            port: 8000,
            path: "/api/products?search=Triacontanol&limit=5",
            method: "GET"
        });
        console.log(`🔍 Search "Triacontanol" matches: ${searchRes.body.total} found`);
        if (searchRes.statusCode !== 200) throw new Error("Search query failed!");

        // Clean up
        await Customer.deleteMany({ phone: { $in: [TEST_USER_PHONE, TEST_ADMIN_PHONE, RATE_LIMIT_TEST_PHONE] } });
        await Banner.deleteMany({ title: "Test Admin Banner" });
        await Coupon.deleteMany({ code: "TESTADMIN50" });

        console.log("\n🎉 ALL PHASE 2 TESTS PASSED SUCCESSFULLY!");
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error("\n❌ Phase 2 Verification Failed:", err);
        process.exit(1);
    }
}

runPhase2Verification();
