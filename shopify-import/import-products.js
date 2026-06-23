const fs = require("fs");
const csv = require("csv-parser");
const mongoose = require("../node_modules/mongoose");

// ===== Mongo Connection =====
const MONGO_URI =
    "mongodb+srv://krishikrantidealer_db_user:KrishiKranti%402026@krishikranti.tyerpvc.mongodb.net/krishibhandar_db?appName=KrishiKranti";


// ===== Models =====
const Category = require("../src/models/Category");
const Product = require("../src/models/Product");

// Helper to classify a product — returns an ARRAY of all matching category names
function classifyProduct(title) {
    const t = title.toLowerCase();
    const matched = [];

    // NPK fertilizers
    if (/npk|\d{2}:\d{2}:\d{2}/.test(t)) matched.push("NPK fertilizers");

    // organic fertilizers
    if ((t.includes("organic") && t.includes("fertilizer")) ||
        t.includes("vermicompost") || t.includes("manure") || t.includes("compost")) {
        if (!t.includes("bio")) matched.push("organic fertilizers");
    }

    // Bio_fertilizers
    if ((t.includes("bio") && t.includes("fertilizer")) ||
        t.includes("azotobacter") || t.includes("rhizobium") ||
        t.includes("mycorrhiza") || t.includes("acetobacter") ||
        t.includes("phosphobacteria") || t.includes("consortium")) {
        matched.push("Bio_fertilizers");
    }

    // Bio-Fungicide
    if ((t.includes("bio") && t.includes("fungicide")) ||
        t.includes("trichoderma") || t.includes("pseudomonas") ||
        t.includes("ampelomyces") || t.includes("bacillus subtilis")) {
        matched.push("Bio-Fungicide");
    }

    // Bio Nematicide
    if (t.includes("nematicide") || t.includes("nematode") ||
        t.includes("paecilomyces") || t.includes("lilacinus") ||
        t.includes("verticillium")) {
        matched.push("Bio Nematicide");
    }

    // Bio-Pesticides
    if ((t.includes("bio") && t.includes("pesticide")) ||
        t.includes("neem oil") || t.includes("neem shield") ||
        t.includes("azadirachtin") || t.includes("beauveria") ||
        t.includes("metarhizium")) {
        matched.push("Bio-Pesticides");
    }

    // organic insecticides
    if (t.includes("organic") && (t.includes("insecticide") || t.includes("miticide"))) {
        matched.push("organic insecticides");
    }

    // Organic Fungicdes
    if (t.includes("organic") && t.includes("fungicide")) {
        matched.push("Organic Fungicdes");
    }

    // Micronutrients
    if (t.includes("micronutrient") || t.includes("boron") ||
        t.includes("zinc") || t.includes("manganese") ||
        t.includes("molybdenum") || t.includes("borax") ||
        t.includes("solubor") || t.includes("chelated")) {
        matched.push("Micronutrients");
    }

    // PGRs
    if (t.includes("pgr") || t.includes("growth regulator") ||
        t.includes("growth promoter") || t.includes("bio-stimulant") ||
        t.includes("biostimulant") || t.includes("amino acid") ||
        t.includes("humic") || t.includes("seaweed") ||
        t.includes("gibberellic") || t.includes("fulvic") ||
        t.includes("nitrobenzene") || t.includes("cytokinin") ||
        t.includes("auxin")) {
        matched.push("PGRs");
    }

    // antibiotices
    if (t.includes("antibiotic") || t.includes("bactericide") ||
        t.includes("streptomycin") || t.includes("tetracycline") ||
        t.includes("streptocycline") || t.includes("kasugamycin") ||
        t.includes("validamycin")) {
        matched.push("antibiotices");
    }

    // fungicides
    if (t.includes("fungicide") ||
        t.includes("carbendazim") || t.includes("mancozeb") ||
        t.includes("metalaxyl") || t.includes("tebuconazole") ||
        t.includes("hexaconazole") || t.includes("propiconazole") ||
        t.includes("azoxystrobin") || t.includes("tricyclazole") ||
        t.includes("cymoxanil") || t.includes("captan") ||
        t.includes("chlorothalonil") || t.includes("copper oxychloride") ||
        t.includes("disease control") || t.includes("susafe")) {
        matched.push("fungicides");
    }

    // herbicides
    if (t.includes("herbicide") || t.includes("weedicide") ||
        t.includes("weed") || t.includes("glyphosate") ||
        t.includes("paraquat") || t.includes("pendimethalin") ||
        t.includes("atrazine") || t.includes("pretilachlor") ||
        t.includes("quizalofop") || t.includes("clodinafop")) {
        matched.push("herbicides");
    }

    // insecticides
    if (t.includes("insecticide") || t.includes("miticide") ||
        t.includes("fipronil") || t.includes("emamectin") ||
        t.includes("imidacloprid") || t.includes("cypermethrin") ||
        t.includes("lambda") || t.includes("chlorpyriphos") ||
        t.includes("monocrotophos") || t.includes("dimethoate") ||
        t.includes("malathion") || t.includes("spinosad") ||
        t.includes("novaluron") || t.includes("indoxacarb") ||
        t.includes("profenofos") || t.includes("acetamiprid") ||
        t.includes("thiamethoxam") || t.includes("diafenthiuron") ||
        t.includes("chlorantraniliprole") || t.includes("remi gold")) {
        matched.push("insecticides");
    }

    // fertilizer (generic — only if no more specific category caught it)
    if (matched.length === 0 &&
        (t.includes("fertilizer") || t.includes("potash") ||
         t.includes("phosphate") || t.includes("urea") ||
         t.includes("ammonium sulphate") || t.includes("calcium nitrate"))) {
        matched.push("fertilizer");
    }

    // Bio Products (Buy 1 Get 1 Free / BOGO)
    if (/1\+1\s+Free|1-1-free|1\+1\s+Free\s+Offer|BOGO/i.test(title)) {
        matched.push("Bio Products");
    }

    return matched;
}

// Helper to determine if product is Buy 1 Get 1
function isBuy1Get1(title, handle) {
    const t = (title || "").toLowerCase();
    const h = (handle || "").toLowerCase();
    return t.includes("1+1 free") || h.includes("1-1-free") || t.includes("1+1 free offer") || t.includes("bogo");
}

// ===== Main Function =====
async function importProducts() {
    try {
        // Connect to Mongo
        await mongoose.connect(MONGO_URI);
        console.log("✅ Mongo Connected");

        const categoryNames = [
            "fertilizer", "fungicides", "herbicides", "insecticides", "PGRs", 
            "organic fertilizers", "Bio-Fungicide", "Bio_fertilizers", "Organic Fungicdes", 
            "Micronutrients", "Bio-Pesticides", "Bio Nematicide", "organic insecticides", 
            "NPK fertilizers", "Bio Products", "antibiotices"
        ];

        // Seed categories and retrieve their IDs
        await Category.deleteMany({});
        const seededCategories = await Category.insertMany(
            categoryNames.map(name => ({ name }))
        );
        console.log(`✅ Seeded ${seededCategories.length} categories`);

        const categoryLookup = {};
        seededCategories.forEach(cat => {
            categoryLookup[cat.name] = cat._id;
        });

        const rows = [];

        // Read CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream("./products_export_1.csv")
                .pipe(csv())
                .on("data", (data) => rows.push(data))
                .on("end", resolve)
                .on("error", reject);
        });

        console.log(`✅ CSV Loaded: ${rows.length} rows`);

        const groupedProducts = {};

        rows.forEach((row) => {
            const handle = row["Handle"];

            if (!handle) return;

            if (!groupedProducts[handle]) {
                const title = row["Title"] || "";
                groupedProducts[handle] = {
                    handle: handle,
                    title: title,
                    bodyHtml: row["Body (HTML)"] || "",
                    vendor: row["Vendor"] || "",
                    status: row["Status"] || "",
                    buy1get1: isBuy1Get1(title, handle),
                    variants: [],
                    images: [],
                    importedAt: new Date()
                };
            } else {
                // Populate fields if they are missing in the first row but present in later rows
                if (!groupedProducts[handle].title && row["Title"]) {
                    groupedProducts[handle].title = row["Title"];
                    groupedProducts[handle].buy1get1 = isBuy1Get1(row["Title"], handle);
                }
                if (!groupedProducts[handle].bodyHtml && row["Body (HTML)"]) {
                    groupedProducts[handle].bodyHtml = row["Body (HTML)"];
                }
                if (!groupedProducts[handle].vendor && row["Vendor"]) {
                    groupedProducts[handle].vendor = row["Vendor"];
                }
                if (!groupedProducts[handle].status && row["Status"]) {
                    groupedProducts[handle].status = row["Status"];
                }
            }

            // Extract variant if Option1 Value or Variant SKU is present
            if (row["Option1 Value"] || row["Variant SKU"]) {
                let sku = (row["Variant SKU"] || "").trim();

                // Auto-generate SKU if it's blank in the CSV
                if (!sku) {
                    const cleanHandle = handle.replace(/^krishikranti-/, "kk-");
                    const handleParts = cleanHandle.split("-");
                    const prefix = handleParts.slice(0, 3).join("-").toUpperCase();

                    const optionClean = (row["Option1 Value"] || "")
                        .split(" ")[0]
                        .replace(/[^a-zA-Z0-9]/g, "")
                        .toUpperCase();

                    sku = optionClean ? `${prefix}-${optionClean}` : prefix;
                }

                const variant = {
                    sku: sku,
                    option: row["Option1 Value"] || "",
                    price: row["Variant Price"] || "",
                    compareAtPrice: row["Variant Compare At Price"] || "",
                    stock: row["Variant Inventory Qty"] || ""
                };

                // Check if this variant has already been added
                const isDuplicate = groupedProducts[handle].variants.some(
                    (v) => v.option === variant.option && v.sku === variant.sku
                );
                if (!isDuplicate) {
                    groupedProducts[handle].variants.push(variant);
                }
            }

            // Extract image if present
            if (row["Image Src"]) {
                const imageUrl = row["Image Src"].trim();
                if (imageUrl) {
                    const isDuplicate = groupedProducts[handle].images.some(img => 
                        (typeof img === "string" && img === imageUrl) ||
                        (img && img.original === imageUrl)
                    );
                    if (!isDuplicate) {
                        groupedProducts[handle].images.push({
                            original: imageUrl,
                            medium: "",
                            low: ""
                        });
                    }
                }
            }
        });

        const products = Object.values(groupedProducts);

        // Classify each product and assign categoryIds (array — a product can belong to multiple)
        products.forEach((prod) => {
            const catNames = classifyProduct(prod.title);
            prod.categoryIds = catNames
                .filter(name => categoryLookup[name])
                .map(name => categoryLookup[name]);
        });

        console.log(`✅ Grouped into ${products.length} products`);

        // OPTIONAL: Clear old imported data
        await Product.deleteMany({});
        console.log("🗑 Cleared old products");

        // Insert new data
        await Product.insertMany(products);

        console.log(`✅ Imported ${products.length} products successfully`);

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("❌ ERROR:");
        console.error(error);
        process.exit(1);
    }
}

importProducts();