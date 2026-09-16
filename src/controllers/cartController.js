const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");

// Helper to recalculate cart subtotal, discount, and total
async function recalculateCart(cart) {
    let subtotal = 0;
    for (const item of cart.items) {
        // Refresh product price dynamically if product exists
        if (item.productId) {
            try {
                const product = await Product.findById(item.productId);
                if (product && product.variants) {
                    let variant;
                    if (item.variantId) {
                        variant = product.variants.find(v => v._id && v._id.toString() === item.variantId.toString());
                    } else if (item.variantSku) {
                        variant = product.variants.find(v => v.sku === item.variantSku);
                    }
                    if (variant && variant.price) {
                        item.price = parseFloat(variant.price) || item.price;
                    }
                }
            } catch (pErr) {
                // Keep existing price if query fails
            }
        }
        subtotal += item.price * item.quantity;
    }
    cart.subtotal = subtotal;

    let discountAmount = 0;
    if (cart.couponCode) {
        const coupon = await Coupon.findOne({ code: cart.couponCode.toUpperCase() });
        if (coupon && coupon.status === "active") {
            const now = new Date();
            const startValid = coupon.startDate <= now;
            const endValid = !coupon.endDate || coupon.endDate >= now;

            if (startValid && endValid && subtotal >= coupon.minimumPurchase) {
                if (coupon.valueType === "percentage") {
                    discountAmount = subtotal * (coupon.value / 100);
                } else if (coupon.valueType === "fixed_amount") {
                    discountAmount = coupon.value;
                }
                
                // Capped discount at subtotal
                if (discountAmount > subtotal) {
                    discountAmount = subtotal;
                }
            } else {
                // Minimum purchase not met, or expired coupon - remove from cart
                cart.couponCode = "";
            }
        } else {
            // Coupon not found or inactive - remove from cart
            cart.couponCode = "";
        }
    }
    cart.discountAmount = discountAmount;
    cart.total = Math.max(0, subtotal - discountAmount);
}

// GET /api/cart
const getCart = async (req, res) => {
    try {
        const customerId = req.user.id;
        let cart = await Cart.findOne({ customerId }).populate("items.productId", "title handle images");

        if (!cart) {
            // Return a virtual empty cart if it doesn't exist yet
            cart = new Cart({ customerId, items: [] });
            await cart.save();
        }

        res.json({ success: true, data: cart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/cart/items
const addToCart = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { productId, variantSku, variantId, quantity = 1 } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: "productId is required" });
        }
        if (!variantSku && !variantId) {
            return res.status(400).json({ success: false, message: "Either variantSku or variantId is required" });
        }

        // Fetch product to guarantee price validity
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Find the variant
        let variant;
        if (variantId) {
            variant = product.variants.find(v => v._id && v._id.toString() === variantId.toString());
        } else if (variantSku) {
            variant = product.variants.find(v => v.sku === variantSku);
        }

        if (!variant) {
            return res.status(404).json({ success: false, message: "Product variant not found" });
        }

        const price = parseFloat(variant.price) || 0.0;
        const title = product.title;
        const option = variant.option;
        const resolvedSku = variant.sku || "";
        const resolvedVariantId = variant._id;

        let cart = await Cart.findOne({ customerId });
        if (!cart) {
            cart = new Cart({ customerId, items: [] });
        }

        // Check if item already in cart (match by variantId if available, otherwise by SKU)
        const existingItemIndex = cart.items.findIndex(item => {
            if (resolvedVariantId && item.variantId) {
                return item.variantId.toString() === resolvedVariantId.toString();
            }
            return item.variantSku === resolvedSku;
        });

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity += Number(quantity);
        } else {
            cart.items.push({
                productId,
                variantId: resolvedVariantId,
                variantSku: resolvedSku,
                quantity: Number(quantity),
                price,
                title,
                option
            });
        }

        await recalculateCart(cart);
        await cart.save();

        const populatedCart = await Cart.findById(cart._id).populate("items.productId", "title handle images");
        res.json({ success: true, data: populatedCart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/cart/items/:variantIdOrSku
const updateCartItem = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { variantIdOrSku } = req.params;
        const { quantity } = req.body;

        if (quantity === undefined) {
            return res.status(400).json({ success: false, message: "quantity is required" });
        }

        let cart = await Cart.findOne({ customerId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const itemIndex = cart.items.findIndex(item => {
            if (item.variantId && item.variantId.toString() === variantIdOrSku) {
                return true;
            }
            return item.variantSku === variantIdOrSku;
        });

        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: "Item not found in cart" });
        }

        if (Number(quantity) <= 0) {
            // Remove item
            cart.items.splice(itemIndex, 1);
        } else {
            cart.items[itemIndex].quantity = Number(quantity);
        }

        await recalculateCart(cart);
        await cart.save();

        const populatedCart = await Cart.findById(cart._id).populate("items.productId", "title handle images");
        res.json({ success: true, data: populatedCart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/cart/items/:variantIdOrSku
const removeFromCart = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { variantIdOrSku } = req.params;

        let cart = await Cart.findOne({ customerId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        cart.items = cart.items.filter(item => {
            if (item.variantId && item.variantId.toString() === variantIdOrSku) {
                return false;
            }
            return item.variantSku !== variantIdOrSku;
        });

        await recalculateCart(cart);
        await cart.save();

        const populatedCart = await Cart.findById(cart._id).populate("items.productId", "title handle images");
        res.json({ success: true, data: populatedCart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/cart/apply-coupon
const applyCoupon = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { couponCode } = req.body;

        if (!couponCode) {
            return res.status(400).json({ success: false, message: "couponCode is required" });
        }

        let cart = await Cart.findOne({ customerId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        // Fetch and validate coupon
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid coupon code" });
        }

        if (coupon.status !== "active") {
            return res.status(400).json({ success: false, message: "Coupon has expired or is inactive" });
        }

        const now = new Date();
        if (coupon.startDate > now) {
            return res.status(400).json({ success: false, message: "Coupon is not active yet" });
        }
        if (coupon.endDate && coupon.endDate < now) {
            return res.status(400).json({ success: false, message: "Coupon has expired" });
        }

        // Set couponCode and recalculate (validates minimum purchase)
        cart.couponCode = coupon.code;
        await recalculateCart(cart);

        // If the coupon calculation reset it (e.g. minimum purchase requirement failed)
        if (!cart.couponCode) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of INR ${coupon.minimumPurchase} is required for this coupon.`
            });
        }

        await cart.save();

        const populatedCart = await Cart.findById(cart._id).populate("items.productId", "title handle images");
        res.json({ success: true, message: "Coupon applied successfully", data: populatedCart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/cart/coupon
const removeCoupon = async (req, res) => {
    try {
        const customerId = req.user.id;

        let cart = await Cart.findOne({ customerId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        cart.couponCode = "";
        await recalculateCart(cart);
        await cart.save();

        const populatedCart = await Cart.findById(cart._id).populate("items.productId", "title handle images");
        res.json({ success: true, message: "Coupon removed successfully", data: populatedCart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/cart
const clearCart = async (req, res) => {
    try {
        const customerId = req.user.id;

        let cart = await Cart.findOne({ customerId });
        if (!cart) {
            cart = new Cart({ customerId, items: [] });
        } else {
            cart.items = [];
            cart.couponCode = "";
            cart.subtotal = 0.0;
            cart.discountAmount = 0.0;
            cart.total = 0.0;
        }

        await cart.save();
        res.json({ success: true, message: "Cart cleared successfully", data: cart });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    applyCoupon,
    removeCoupon,
    clearCart
};
