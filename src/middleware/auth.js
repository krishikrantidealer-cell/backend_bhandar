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
        const sessionData = await redisClient.get(`session:${token}`);
        if (!sessionData) {
            return res.status(401).json({ success: false, message: "Session expired or logged out" });
        }

        req.user = decoded;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

module.exports = authMiddleware;
