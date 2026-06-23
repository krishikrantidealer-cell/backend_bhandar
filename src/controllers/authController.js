const Customer = require("../models/Customer");
const { getRedisClient } = require("../config/redis");
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

        // Mock sending via Airtel IQ - log it to console
        console.log(`\n📲 [Airtel IQ Mock SMS Gateway] Send OTP ${code} to ${cleanPhone}\n`);

        res.status(200).json({
            success: true,
            message: "OTP sent successfully (Mocked)",
            // Return code for testing ease in non-production
            code: process.env.NODE_ENV !== "production" ? code : undefined
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

        // Check for master OTP or Redis stored OTP
        let otpIsValid = false;
        const redisClient = await getRedisClient();

        if (cleanOtp === "123456") {
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

        // Check if customer exists in the system
        let customer = await Customer.findOne({ phone: cleanPhone });

        if (!customer) {
            // Auto-register a new customer
            console.log(`👤 Customer with phone ${cleanPhone} not found. Registering a new customer...`);
            
            // Find highest numeric ID string to increment sequentially
            const lastCust = await Customer.findOne({ _id: /^[0-9]+$/ }).sort({ _id: -1 });
            let nextIdVal = 8000000000000; // Start range for newly registered customers
            if (lastCust) {
                const num = parseInt(lastCust._id, 10);
                if (!isNaN(num)) {
                    nextIdVal = num + 1;
                }
            }

            customer = new Customer({
                _id: nextIdVal.toString(),
                firstName: "Guest",
                lastName: "User",
                phone: cleanPhone,
                email: "",
                status: "active"
            });
            await customer.save();
            console.log(`✅ Auto-registered customer: ${customer._id}`);
        }

        // Generate JWT Token
        const jwtSecret = process.env.JWT_SECRET || "krishikranti_super_secure_token_secret_2026";
        const token = jwt.sign(
            { id: customer._id, phone: customer.phone },
            jwtSecret,
            { expiresIn: "7d" } // 7-day session token expiration
        );

        // Store the active session in Redis (expires in 7 days / 604800 seconds)
        const sessionData = {
            customerId: customer._id,
            phone: customer.phone,
            deviceInfo: req.headers["user-agent"] || "",
            ipAddress: req.ip || "",
            createdAt: new Date().toISOString()
        };
        await redisClient.setEx(`session:${token}`, 604800, JSON.stringify(sessionData));

        // Delete OTP from Redis
        await redisClient.del(`otp:${cleanPhone}`);

        res.status(200).json({
            success: true,
            message: "Authentication successful",
            token,
            customer
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/auth/logout (protected)
const logout = async (req, res) => {
    try {
        const token = req.token;
        const redisClient = await getRedisClient();
        await redisClient.del(`session:${token}`);
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

        // Retrieve all session keys and invalidate matching customer IDs
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

        res.json({ success: true, message: "Logged out from all devices successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { sendOtp, verifyOtp, logout, logoutAll };
