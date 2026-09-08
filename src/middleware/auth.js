const jwt = require("jsonwebtoken");
const { getRedisClient } = require("../config/redis");

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "Authentication required (token missing)" });
        }

        const token = authHeader.split(" ")[1];
        const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || "krishikranti_super_secure_token_secret_2026";

        const decoded = jwt.verify(token, secret);

        const redisClient = await getRedisClient();
        const sessionDataStr = await redisClient.get(`session:${token}`);
        if (!sessionDataStr) {
            return res.status(401).json({ success: false, message: "Session expired or logged out" });
        }

        let sessionData = {};
        try {
            sessionData = JSON.parse(sessionDataStr);
        } catch (e) {
            // fallback if string
        }

        req.user = {
            id: decoded.id || sessionData.customerId,
            phone: decoded.phone || sessionData.phone,
            email: decoded.email || sessionData.email || "",
            role: sessionData.role || decoded.role || "customer"
        };
        req.token = token;  // Attach token for logout
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

const adminMiddleware = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Forbidden: Admin privileges required" });
    }
    next();
};

module.exports = { authMiddleware, adminMiddleware };
