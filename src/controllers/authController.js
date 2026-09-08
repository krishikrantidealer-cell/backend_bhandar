const Customer = require("../models/Customer");
const { getRedisClient } = require("../config/redis");
const { getNextSequence } = require("../models/Counter");
const jwt = require("jsonwebtoken");

// POST /api/auth/send-otp
const sendOtp = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone number is required" });
        }

        const cleanPhone = phone.trim();

        // Generate a 6-digit OTP code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP to Redis (expires in 5 minutes / 300 seconds)
        const redisClient = await getRedisClient();
        await redisClient.setEx(`otp:${cleanPhone}`, 300, code);

        // --- Airtel IQ SMS Integration ---
        const username = process.env.AIRTEL_IQ_USERNAME;
        const password = process.env.AIRTEL_IQ_PASSWORD;
        const customerId = process.env.AIRTEL_IQ_CUSTOMER_ID;
        const dltEntityId = process.env.AIRTEL_IQ_ENTITY_ID;
        const dltTemplateId = process.env.AIRTEL_IQ_DLT_TEMPLATE_ID;
        const sourceAddress = process.env.AIRTEL_IQ_SOURCE_ADDRESS;
        const template = process.env.AIRTEL_IQ_MESSAGE_TEMPLATE || "{otp} is your login OTP for Krishikranti Organics.";

        const message = template.replace("{otp}", code);

        try {
            if (username && password && customerId) {
                const auth = Buffer.from(`${username}:${password}`).toString("base64");
                const response = await fetch("https://iqmessaging.airtel.in/api/v1/sms/send", {
                    method: "POST",
                    headers: {
                        "Authorization": `Basic ${auth}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        customerId,
                        destination: [cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`],
                        message,
                        sourceAddress,
                        dltEntityId,
                        dltTemplateId,
                        messageType: "SERVICE_IMPLICIT"
                    })
                });

                if (!response.ok) {
                    const result = await response.json();
                    console.error("❌ Airtel IQ SMS Failed:", result);
                } else {
                    console.log("✅ SMS sent successfully via Airtel IQ");
                }
            } else {
                console.warn("⚠️ Airtel IQ credentials missing. OTP logged to console.");
                console.log(`📲 [Mock] Send OTP ${code} to ${cleanPhone}`);
            }
        } catch (smsError) {
            console.error("❌ SMS Gateway Error:", smsError.message);
        }

        res.status(200).json({
            success: true,
            message: "OTP sent successfully",
            code: process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_OTP === "true" ? code : undefined
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: "Phone and OTP are required" });
        }

        const cleanPhone = phone.trim();
        const cleanOtp = otp.trim();

        let otpIsValid = false;
        const redisClient = await getRedisClient();

        const isTestEnv = process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_OTP === "true";
        if (isTestEnv && cleanOtp === "123456") {
            otpIsValid = true;
        } else {
            const storedOtp = await redisClient.get(`otp:${cleanPhone}`);
            if (storedOtp && storedOtp === cleanOtp) {
                otpIsValid = true;
            }
        }

        if (!otpIsValid) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        let customer = await Customer.findOne({ phone: cleanPhone });

        if (!customer) {
            console.log(`👤 Customer with phone ${cleanPhone} not found. Registering a new customer...`);
            const nextIdVal = await getNextSequence("customerId", 8000000000000);

            customer = new Customer({
                _id: nextIdVal.toString(),
                firstName: "Guest",
                lastName: "User",
                phone: cleanPhone,
                email: "",
                role: "customer",
                status: "active"
            });
            await customer.save();
        }

        const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "krishikranti_super_secure_token_secret_2026";
        const token = jwt.sign(
            { id: customer._id, phone: customer.phone, role: customer.role || "customer" },
            jwtSecret,
            { expiresIn: "7d" }
        );

        const sessionData = {
            customerId: customer._id,
            phone: customer.phone,
            role: customer.role || "customer",
            email: customer.email || "",
            deviceInfo: req.headers["user-agent"] || "",
            ipAddress: req.ip || "",
            createdAt: new Date().toISOString()
        };
        await redisClient.setEx(`session:${token}`, 604800, JSON.stringify(sessionData));

        // Track active user token in Redis set for O(1) user logoutAll operations
        if (redisClient.sAdd) {
            await redisClient.sAdd(`user_sessions:${customer._id}`, token);
        }

        // Delete OTP from Redis
        await redisClient.del(`otp:${cleanPhone}`);

        res.status(200).json({ success: true, message: "Authentication successful", token, customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/auth/logout (protected)
const logout = async (req, res) => {
    try {
        const token = req.token;
        const customerId = req.user.id;
        const redisClient = await getRedisClient();

        await redisClient.del(`session:${token}`);
        if (redisClient.sRem && customerId) {
            await redisClient.sRem(`user_sessions:${customerId}`, token);
        }

        res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/auth/logout-all (protected)
const logoutAll = async (req, res) => {
    try {
        const customerId = req.user.id;
        const redisClient = await getRedisClient();

        if (redisClient.sMembers) {
            const activeTokens = await redisClient.sMembers(`user_sessions:${customerId}`);
            if (activeTokens && activeTokens.length > 0) {
                for (const tok of activeTokens) {
                    await redisClient.del(`session:${tok}`);
                }
            }
            await redisClient.del(`user_sessions:${customerId}`);
        } else {
            // Fallback
            const keys = await redisClient.keys("session:*");
            for (const key of keys) {
                const dataStr = await redisClient.get(key);
                if (dataStr) {
                    const data = JSON.parse(dataStr);
                    if (data.customerId === customerId) {
                        await redisClient.del(key);
                    }
                }
            }
        }
        res.json({ success: true, message: "Logged out from all devices successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { sendOtp, verifyOtp, logout, logoutAll };
