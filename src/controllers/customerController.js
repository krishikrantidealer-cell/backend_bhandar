const Customer = require("../models/Customer");

// GET /api/customers (Admin only)
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
                .sort({ totalSpent: -1, createdAt: -1 })
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

// GET /api/customers/me
// Returns current authenticated customer profile
const getCurrentCustomer = async (req, res) => {
    try {
        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer profile not found" });
        }
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/customers/:id
// Protected: Self or Admin
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await Customer.findById(id);

        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/customers/:id
// Protected: Self or Admin
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, email, defaultAddress, note } = req.body;

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        if (firstName !== undefined) customer.firstName = firstName.trim();
        if (lastName !== undefined) customer.lastName = lastName.trim();
        if (email !== undefined) customer.email = email.trim();
        if (note !== undefined) customer.note = note.trim();
        if (defaultAddress !== undefined) customer.defaultAddress = defaultAddress;
        if (req.body.isprofilecompleted !== undefined) {
            customer.isprofilecompleted = Boolean(req.body.isprofilecompleted);
        } else {
            const hasName = Boolean((customer.firstName || '').trim() || (customer.lastName || '').trim());
            const hasPhone = Boolean((customer.phone || '').trim());
            const hasAddr = Boolean(customer.defaultAddress && (customer.defaultAddress.address1 || customer.defaultAddress.city || customer.defaultAddress.zip));
            customer.isprofilecompleted = Boolean(hasName && hasPhone && hasAddr);
        }

        // If admin, can also update role/status
        if (req.user.role === "admin") {
            if (req.body.role) customer.role = req.body.role;
            if (req.body.status) customer.status = req.body.status;
        }

        await customer.save();
        res.json({ success: true, message: "Profile updated successfully", data: customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/customers/:id/addresses
// Protected: Add address to customer address book
const addCustomerAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const addressData = req.body;

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        if (addressData.isDefault) {
            customer.addresses.forEach(a => a.isDefault = false);
            customer.defaultAddress = {
                company: addressData.company || "",
                address1: addressData.address1 || addressData.street || "",
                address2: addressData.address2 || "",
                city: addressData.city || "",
                province: addressData.province || "",
                country: addressData.country || "India",
                zip: addressData.zip || "",
                phone: addressData.phone || customer.phone
            };
        }

        customer.addresses.push(addressData);
        await customer.save();

        res.status(201).json({ success: true, message: "Address added successfully", data: customer.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/customers/:id/addresses/:addressId
// Protected: Delete address from customer address book
const deleteCustomerAddress = async (req, res) => {
    try {
        const { id, addressId } = req.params;

        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        customer.addresses = customer.addresses.filter(a => a._id.toString() !== addressId);
        await customer.save();

        res.json({ success: true, message: "Address deleted successfully", data: customer.addresses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllCustomers,
    getCurrentCustomer,
    getCustomerById,
    updateCustomer,
    addCustomerAddress,
    deleteCustomerAddress
};
