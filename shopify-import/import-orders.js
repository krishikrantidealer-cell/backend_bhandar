const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("mongoose");

// ===== Mongo Connection =====
const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";

// ===== Schema =====
const OrderSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    email: { type: String },
    phone: { type: String },
    status: { type: String, enum: ["pending", "processing", "completed", "cancelled", "refunded"] },
    financialStatus: { type: String },
    fulfillmentStatus: { type: String },
    total: { type: Number },
    subtotal: { type: Number },
    shipping: { type: Number },
    taxes: { type: Number },
    discountAmount: { type: Number },
    shippingMethod: { type: String },
    paymentMethod: { type: String },
    createdAt: { type: Date },
    billingAddress: {
        name: { type: String },
        street: { type: String },
        address1: { type: String },
        address2: { type: String },
        company: { type: String },
        city: { type: String },
        zip: { type: String },
        province: { type: String },
        country: { type: String },
        phone: { type: String }
    },
    shippingAddress: {
        name: { type: String },
        street: { type: String },
        address1: { type: String },
        address2: { type: String },
        company: { type: String },
        city: { type: String },
        zip: { type: String },
        province: { type: String },
        country: { type: String },
        phone: { type: String }
    },
    lineItems: [{
        name: { type: String },
        quantity: { type: Number },
        price: { type: Number },
        sku: { type: String },
        requiresShipping: { type: Boolean },
        taxable: { type: Boolean },
        fulfillmentStatus: { type: String },
        discount: { type: Number }
    }],
    notes: { type: String },
    cancelledAt: { type: Date },
    importedAt: { type: Date, default: Date.now }
}, { strict: false });

const Order = mongoose.model("Order", OrderSchema, "orders");

// Utility to clean values by removing leading single quotes and trimming
function clean(val) {
    if (typeof val !== "string") return val;
    let v = val.trim();
    if (v.startsWith("'")) {
        v = v.substring(1);
    }
    return v;
}

function parseBool(val) {
    if (!val) return false;
    const v = val.trim().toLowerCase();
    return v === "yes" || v === "true";
}

function parseDate(val) {
    if (!val) return null;
    const d = new Date(val.trim());
    return isNaN(d.getTime()) ? null : d;
}

// Logic to derive custom order status
function getOrderStatus(row) {
    const cancelledAt = row["Cancelled at"];
    if (cancelledAt && cancelledAt.trim() !== "") {
        return "cancelled";
    }

    const financialStatus = (row["Financial Status"] || "").toLowerCase().trim();
    if (financialStatus === "refunded") {
        return "refunded";
    }

    const fulfillmentStatus = (row["Fulfillment Status"] || "").toLowerCase().trim();
    if (fulfillmentStatus === "fulfilled") {
        return "completed";
    }

    if (financialStatus === "paid") {
        return "processing";
    }

    return "pending";
}

async function importOrders() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

        const rows = [];

        // Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream("./orders_export.csv")
                .pipe(csv())
                .on("data", (data) => rows.push(data))
                .on("end", resolve)
                .on("error", reject);
        });

        console.log(`✅ CSV Loaded: ${rows.length} rows`);

        const groupedOrders = {};

        rows.forEach((row) => {
            const name = row["Name"];
            if (!name) return;

            if (!groupedOrders[name]) {
                groupedOrders[name] = {
                    name: name,
                    email: row["Email"] || "",
                    phone: clean(row["Phone"] || ""),
                    status: getOrderStatus(row),
                    financialStatus: row["Financial Status"] || "",
                    fulfillmentStatus: row["Fulfillment Status"] || "",
                    total: parseFloat(row["Total"]) || 0.0,
                    subtotal: parseFloat(row["Subtotal"]) || 0.0,
                    shipping: parseFloat(row["Shipping"]) || 0.0,
                    taxes: parseFloat(row["Taxes"]) || 0.0,
                    discountAmount: parseFloat(row["Discount Amount"]) || 0.0,
                    shippingMethod: row["Shipping Method"] || "",
                    paymentMethod: row["Payment Method"] || "",
                    createdAt: parseDate(row["Created at"]),
                    billingAddress: {
                        name: row["Billing Name"] || "",
                        street: row["Billing Street"] || "",
                        address1: row["Billing Address1"] || "",
                        address2: row["Billing Address2"] || "",
                        company: row["Billing Company"] || "",
                        city: row["Billing City"] || "",
                        zip: clean(row["Billing Zip"] || ""),
                        province: row["Billing Province"] || "",
                        country: row["Billing Country"] || "",
                        phone: clean(row["Billing Phone"] || "")
                    },
                    shippingAddress: {
                        name: row["Shipping Name"] || "",
                        street: row["Shipping Street"] || "",
                        address1: row["Shipping Address1"] || "",
                        address2: row["Shipping Address2"] || "",
                        company: row["Shipping Company"] || "",
                        city: row["Shipping City"] || "",
                        zip: clean(row["Shipping Zip"] || ""),
                        province: row["Shipping Province"] || "",
                        country: row["Shipping Country"] || "",
                        phone: clean(row["Shipping Phone"] || "")
                    },
                    lineItems: [],
                    notes: row["Notes"] || "",
                    cancelledAt: parseDate(row["Cancelled at"]),
                    importedAt: new Date()
                };
            } else {
                // In subsequent rows, update main properties if not set
                if (!groupedOrders[name].email && row["Email"]) groupedOrders[name].email = row["Email"];
                if (!groupedOrders[name].phone && row["Phone"]) groupedOrders[name].phone = clean(row["Phone"]);
                if (!groupedOrders[name].financialStatus && row["Financial Status"]) groupedOrders[name].financialStatus = row["Financial Status"];
                if (!groupedOrders[name].fulfillmentStatus && row["Fulfillment Status"]) {
                    groupedOrders[name].fulfillmentStatus = row["Fulfillment Status"];
                    groupedOrders[name].status = getOrderStatus(row);
                }
            }

            // Extract line item
            if (row["Lineitem name"]) {
                const lineItem = {
                    name: row["Lineitem name"],
                    quantity: parseInt(row["Lineitem quantity"], 10) || 1,
                    price: parseFloat(row["Lineitem price"]) || 0.0,
                    sku: row["Lineitem sku"] || "",
                    requiresShipping: parseBool(row["Lineitem requires shipping"]),
                    taxable: parseBool(row["Lineitem taxable"]),
                    fulfillmentStatus: row["Lineitem fulfillment status"] || "pending",
                    discount: parseFloat(row["Lineitem discount"]) || 0.0
                };

                const isDuplicate = groupedOrders[name].lineItems.some(
                    (li) => li.sku === lineItem.sku && li.name === lineItem.name && li.quantity === lineItem.quantity
                );
                if (!isDuplicate) {
                    groupedOrders[name].lineItems.push(lineItem);
                }
            }
        });

        const orders = Object.values(groupedOrders);
        console.log(`✅ Grouped into ${orders.length} unique orders`);

        // Clear old data
        await Order.deleteMany({});
        console.log("🗑 Cleared old orders");

        // Insert new data
        await Order.insertMany(orders);
        console.log(`✅ Imported ${orders.length} orders successfully`);

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("❌ ERROR:");
        console.error(error);
        process.exit(1);
    }
}

importOrders();
