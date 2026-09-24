const Coupon = require("../models/Coupon");

// GET /api/coupons
// Query params: ?page=1&limit=20&search=EBS&status=active
const getAllCoupons = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (search) filter.$text = { $search: search };

        const skip = (Number(page) - 1) * Number(limit);

        const [coupons, total] = await Promise.all([
            Coupon.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Coupon.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: coupons
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/coupons/:code
const getCouponByCode = async (req, res) => {
    try {
        const { code } = req.params;
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });

        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }
        res.json({ success: true, data: coupon });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/coupons
const createCoupon = async (req, res) => {
    try {
        const couponData = req.body;
        if (!couponData.code) {
            return res.status(400).json({ success: false, message: "Coupon code is required" });
        }

        couponData.code = couponData.code.toUpperCase().trim();

        // Check if coupon code already exists
        const existing = await Coupon.findOne({ code: couponData.code });
        if (existing) {
            return res.status(400).json({ success: false, message: "Coupon code already exists" });
        }

        if (!couponData.startDate) {
            couponData.startDate = new Date();
        }

        const newCoupon = new Coupon(couponData);
        await newCoupon.save();

        res.status(201).json({ success: true, data: newCoupon });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/coupons/:id (Admin Only)
const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const mongoose = require("mongoose");

        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { code: id.toUpperCase().trim() };
        }

        if (data.code) {
            data.code = data.code.toUpperCase().trim();
        }

        const coupon = await Coupon.findOneAndUpdate(query, { $set: data }, { new: true, runValidators: true });
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        res.json({ success: true, coupon, data: coupon });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/coupons/:id (Admin Only)
const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const mongoose = require("mongoose");

        let query = {};
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { _id: new mongoose.Types.ObjectId(id) };
        } else {
            query = { code: id.toUpperCase().trim() };
        }

        const coupon = await Coupon.findOneAndDelete(query);
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Coupon not found" });
        }

        res.json({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getAllCoupons, getCouponByCode, createCoupon, updateCoupon, deleteCoupon };
