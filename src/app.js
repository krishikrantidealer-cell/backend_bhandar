const express = require("express");
const cors = require("cors");

const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const collectionRoutes = require("./routes/collections");
const customerRoutes = require("./routes/customers");
const orderRoutes = require("./routes/orders");
const couponRoutes = require("./routes/coupons");
const cartRoutes = require("./routes/cart");
const authRoutes = require("./routes/auth");
const bannerRoutes = require("./routes/banners");

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Routes =====
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/banners", bannerRoutes);

// ===== Health Check =====
app.get("/", (req, res) => {
    res.json({ success: true, message: "Krishi Bhandar API is running 🌱" });
});

// ===== 404 Handler =====
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ===== Global Error Handler =====
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: "Internal server error" });
});

module.exports = app;
