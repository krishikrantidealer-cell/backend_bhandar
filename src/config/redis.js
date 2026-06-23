const redis = require("redis");

let redisClient;
let isRedisMock = false;

const mockStore = new Map();

// High fidelity in-memory fallback mock store for development
const mockClient = {
    connect: async () => {
        console.log("⚠️ [Redis Client] offline. Using in-memory fallback store.");
        return;
    },
    setEx: async (key, seconds, value) => {
        mockStore.set(key, {
            value,
            expiresAt: Date.now() + (seconds * 1000)
        });
        return "OK";
    },
    get: async (key) => {
        const item = mockStore.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
            mockStore.delete(key);
            return null;
        }
        return item.value;
    },
    del: async (key) => {
        return mockStore.delete(key) ? 1 : 0;
    },
    keys: async (pattern) => {
        // Simple wildcard prefix matching for session search (e.g. session:*)
        const cleanPattern = pattern.replace("*", "");
        const matchedKeys = [];
        const now = Date.now();
        
        for (const [key, item] of mockStore.entries()) {
            if (now > item.expiresAt) {
                mockStore.delete(key);
                continue;
            }
            if (key.startsWith(cleanPattern)) {
                matchedKeys.push(key);
            }
        }
        return matchedKeys;
    },
    quit: async () => {
        mockStore.clear();
        return "OK";
    }
};

async function getRedisClient() {
    if (redisClient) return redisClient;

    const redisUri = process.env.REDIS_URI;
    if (!redisUri) {
        console.log("ℹ️ REDIS_URI not configured. Falling back to in-memory store.");
        redisClient = mockClient;
        isRedisMock = true;
        return redisClient;
    }

    try {
        const client = redis.createClient({ url: redisUri });
        client.on("error", (err) => {
            console.error("❌ Redis Client Connection Error:", err.message);
        });
        await client.connect();
        console.log("✅ Connected to Redis successfully");
        redisClient = client;
    } catch (error) {
        console.error("❌ Failed to connect to Redis. Falling back to in-memory store.");
        redisClient = mockClient;
        isRedisMock = true;
    }

    return redisClient;
}

module.exports = { getRedisClient };
