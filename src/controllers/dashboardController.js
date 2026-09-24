const Product = require("../models/Product");
const Category = require("../models/Category");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");

// GET /api/dashboard/stats (Admin Only)
const getDashboardStats = async (req, res) => {
    try {
        const [
            totalProducts,
            activeCategories,
            totalOrders,
            ordersSummary,
            activeCoupons,
            recentOrders
        ] = await Promise.all([
            Product.countDocuments({ status: "active" }),
            Category.countDocuments(),
            Order.countDocuments(),
            Order.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$total" },
                        count: { $sum: 1 }
                    }
                }
            ]),
            Coupon.countDocuments({ status: "active" }),
            Order.find()
                .sort({ createdAt: -1 })
                .limit(7)
                .lean()
        ]);

        const totalRev = (ordersSummary.length > 0 && ordersSummary[0].totalRevenue) ? ordersSummary[0].totalRevenue : 0;
        const avgOrderVal = totalOrders > 0 ? (totalRev / totalOrders) : 0;

        // Calculate revenue trend for past 7 days
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const now = new Date();
        const past7Days = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const startOfDay = new Date(d.setHours(0, 0, 0, 0));
            const endOfDay = new Date(d.setHours(23, 59, 59, 999));
            const label = days[startOfDay.getDay()];
            past7Days.push({ label, startOfDay, endOfDay });
        }

        const revenueTrend = await Promise.all(
            past7Days.map(async ({ label, startOfDay, endOfDay }) => {
                const dayOrders = await Order.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: startOfDay, $lte: endOfDay }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            amount: { $sum: "$total" },
                            orders: { $sum: 1 }
                        }
                    }
                ]);

                return {
                    label,
                    amount: (dayOrders.length > 0 && dayOrders[0].amount) ? dayOrders[0].amount : 0,
                    orders: (dayOrders.length > 0 && dayOrders[0].orders) ? dayOrders[0].orders : 0
                };
            })
        );

        // Low stock products count (stock < 10)
        const lowStockProducts = await Product.countDocuments({
            $or: [
                { "variants.stock": { $in: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] } },
                { stock: { $lt: 10 } }
            ]
        });

        const stats = {
            totalProducts,
            activeCategories,
            totalOrders,
            totalRevenue: Math.round(totalRev * 100) / 100,
            lowStockProducts,
            activeCoupons,
            averageOrderValue: Math.round(avgOrderVal * 100) / 100,
            revenueTrend,
            recentOrders
        };

        res.json({
            success: true,
            data: stats,
            stats
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getDashboardStats };
