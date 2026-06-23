const mongoose = require("mongoose");
const Product = require("./src/models/Product");
const Cart = require("./src/models/Cart");
const Coupon = require("./src/models/Coupon");

const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

const CUSTOMER_ID = "7384266997913"; // Ram

async function testCart() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

        // 1. Find a product in DB
        const product = await Product.findOne({ "variants.0": { $exists: true } });
        if (!product) {
            console.error("❌ No product found in DB to test cart");
            process.exit(1);
        }
        const variant = product.variants[0];
        console.log(`Testing with Product: "${product.title}"`);
        console.log(`Variant SKU: "${variant.sku}", Price: ${variant.price}`);

        // 2. Clear test customer's cart
        await Cart.deleteMany({ customerId: CUSTOMER_ID });
        console.log("🧹 Cleared test cart");

        // Helper to fetch cart controller logic or simulate it
        let cart = new Cart({ customerId: CUSTOMER_ID, items: [] });

        // Add item
        cart.items.push({
            productId: product._id,
            variantSku: variant.sku,
            quantity: 2,
            price: parseFloat(variant.price) || 0.0,
            title: product.title,
            option: variant.option
        });

        // Recalculate helper
        const recalculate = async (c) => {
            let subtotal = 0;
            for (const item of c.items) {
                subtotal += item.price * item.quantity;
            }
            c.subtotal = subtotal;

            let discount = 0;
            if (c.couponCode) {
                const coupon = await Coupon.findOne({ code: c.couponCode.toUpperCase() });
                if (coupon && coupon.status === "active") {
                    if (subtotal >= coupon.minimumPurchase) {
                        if (coupon.valueType === "percentage") {
                            discount = subtotal * (coupon.value / 100);
                        } else {
                            discount = coupon.value;
                        }
                    }
                }
            }
            c.discountAmount = discount;
            c.total = Math.max(0, subtotal - discount);
        };

        await recalculate(cart);
        await cart.save();
        console.log("➕ Added item to cart:", {
            subtotal: cart.subtotal,
            discount: cart.discountAmount,
            total: cart.total
        });

        // 3. Apply active coupon "FIRST20" (value: 20%, minPurchase: 1000)
        // Let's verify coupon exists
        const coupon = await Coupon.findOne({ code: "FIRST20" });
        if (coupon) {
            console.log(`Found coupon FIRST20: value=${coupon.value}%, minPurchase=${coupon.minimumPurchase}`);
            cart.couponCode = "FIRST20";
            
            // Adjust item quantity so that subtotal is >= 1000 (minimum purchase requirement)
            const requiredQty = Math.ceil(1000 / (parseFloat(variant.price) || 1));
            cart.items[0].quantity = requiredQty;
            console.log(`Adjusted item quantity to ${requiredQty} to meet minPurchase of 1000`);

            await recalculate(cart);
            await cart.save();

            console.log("🎟 Applied FIRST20 coupon:", {
                subtotal: cart.subtotal,
                discount: cart.discountAmount,
                total: cart.total
            });
            if (cart.discountAmount > 0) {
                console.log("✅ Coupon discount applied successfully!");
            } else {
                console.log("❌ Coupon discount failed to apply!");
            }
        } else {
            console.log("❌ Coupon FIRST20 not found in DB");
        }

        await mongoose.connection.close();
        console.log("✅ Verification finished");
        process.exit(0);
    } catch (e) {
        console.error("❌ Test error:", e);
        process.exit(1);
    }
}

testCart();
