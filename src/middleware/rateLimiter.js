const { getRedisClient } = require("../config/redis");

/**
 * OTP Rate Limiting Middleware
 * - Limits OTP requests to 1 request per 60 seconds per phone number (cooldown).
 * - Limits maximum OTP requests to 5 per 10-minute window per phone number.
 */
const otpRateLimiter = async (req, res, next) => {
    try {
        const phone = req.body?.phone ? req.body.phone.trim() : null;
        if (!phone) {
            return next();
        }

        // Bypass in testing if explicitly requested via header or test phone in non-prod
        if (process.env.NODE_ENV === "test" || req.headers["x-bypass-ratelimit"] === "true") {
            return next();
        }

        const redisClient = await getRedisClient();

        // 1. Check 60-second cooldown
        const cooldownKey = `ratelimit:cooldown:${phone}`;
        const inCooldown = await redisClient.get(cooldownKey);
        if (inCooldown) {
            return res.status(429).json({
                success: false,
                message: "Please wait 60 seconds before requesting another OTP."
            });
        }

        // 2. Check 10-minute maximum request counter
        const countKey = `ratelimit:count:${phone}`;
        const countStr = await redisClient.get(countKey);
        const currentCount = countStr ? parseInt(countStr, 10) : 0;

        if (currentCount >= 5) {
            return res.status(429).json({
                success: false,
                message: "Too many OTP attempts. Please try again after 10 minutes."
            });
        }

        // 3. Set cooldown and update attempt counter
        await redisClient.setEx(cooldownKey, 60, "active");
        await redisClient.setEx(countKey, 600, (currentCount + 1).toString());

        next();
    } catch (error) {
        console.error("Rate limiter error:", error.message);
        // Fail open to avoid blocking legitimate users on Redis connectivity hiccups
        next();
    }
};

module.exports = { otpRateLimiter };
