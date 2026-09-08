const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const {
    getAllCustomers,
    getCurrentCustomer,
    getCustomerById,
    updateCustomer,
    addCustomerAddress,
    deleteCustomerAddress
} = require("../controllers/customerController");

// Helper middleware for self or admin authorization
const selfOrAdmin = (req, res, next) => {
    if (req.user.role !== "admin" && req.user.id !== req.params.id) {
        return res.status(403).json({ success: false, message: "Forbidden: Access to another customer's profile is denied" });
    }
    next();
};

// GET /api/customers/me    — logged-in customer's own profile
router.get("/me", authMiddleware, getCurrentCustomer);

// GET /api/customers       — list all customers (admin only)
router.get("/", authMiddleware, adminMiddleware, getAllCustomers);

// GET /api/customers/:id   — single customer profile (self or admin)
router.get("/:id", authMiddleware, selfOrAdmin, getCustomerById);

// PUT /api/customers/:id   — update profile details & default address (self or admin)
router.put("/:id", authMiddleware, selfOrAdmin, updateCustomer);

// POST /api/customers/:id/addresses — add address to address book (self or admin)
router.post("/:id/addresses", authMiddleware, selfOrAdmin, addCustomerAddress);

// DELETE /api/customers/:id/addresses/:addressId — delete address (self or admin)
router.delete("/:id/addresses/:addressId", authMiddleware, selfOrAdmin, deleteCustomerAddress);

module.exports = router;
