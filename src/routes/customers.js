const express = require("express");
const router = express.Router();
const {
    getAllCustomers,
    getCustomerById
} = require("../controllers/customerController");

// GET /api/customers      — list all (with pagination & search)
router.get("/", getAllCustomers);

// GET /api/customers/:id  — single customer by customerId or ObjectId
router.get("/:id", getCustomerById);

module.exports = router;
