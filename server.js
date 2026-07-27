require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 8080;

const start = async () => {
    // 1. Start listening IMMEDIATELY so Cloud Run health checks pass
    const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server listening on port ${PORT}`);
        console.log("⏳ Initializing database connection...");
    });

    try {
        // 2. Then connect to the database
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            console.error("❌ ERROR: MONGO_URI/MONGODB_URI is not defined.");
            process.exit(1);
        }

        await connectDB();
        console.log("✅ Database initialized successfully.");
    } catch (err) {
        console.error("❌ Fatal error during DB connection:", err.message);
        process.exit(1);
    }
};

start();
