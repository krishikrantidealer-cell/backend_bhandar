const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
    getAllCustomers,
    getCustomerById
} = require("../controllers/customerController");

// GET /api/customers      — list all (with pagination & search, protected)
router.get("/", authMiddleware, getAllCustomers);

// GET /api/customers/:id  — single customer profile (protected, self-access only)
router.get("/:id", authMiddleware, (req, res, next) => {
    if (req.user.id !== req.params.id) {
        return res.status(403).json({ success: false, message: "Forbidden: Access to another customer's profile is denied" });
    }
    next();
}, getCustomerById);

module.exports = router;
