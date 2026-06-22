const Customer = require("../models/Customer");
const mongoose = require("mongoose");

// GET /api/customers
// Query params: ?page=1&limit=20&search=<text>
const getAllCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;

        const filter = {};
        if (search) {
            filter.$text = { $search: search };
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [customers, total] = await Promise.all([
            Customer.find(filter)
                .sort({ totalSpent: -1, createdAt: -1 }) // Sort by totalSpent by default, then date
                .skip(skip)
                .limit(Number(limit)),
            Customer.countDocuments(filter)
        ]);

        res.json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: customers
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/customers/:id
// Can query by customerId (Shopify) or MongoDB ObjectId
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        let customer;

        if (mongoose.Types.ObjectId.isValid(id)) {
            customer = await Customer.findById(id);
        } else {
            customer = await Customer.findOne({ customerId: id });
        }

        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getAllCustomers, getCustomerById };
