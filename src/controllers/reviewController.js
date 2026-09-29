const Review = require("../models/Review");

// GET /api/reviews?productId=...
exports.getReviews = async (req, res) => {
    try {
        const { productId, status, rating, hasImages, page, limit } = req.query;
        const filter = {};

        if (productId) {
            filter.productId = String(productId).trim();
        }
        if (status) {
            filter.status = status;
        } else if (productId) {
            filter.status = "approved"; // Public only sees approved reviews by default
        }

        if (rating) {
            const rNum = Number(rating);
            if (!isNaN(rNum) && rNum >= 1 && rNum <= 5) {
                filter.rating = rNum;
            }
        }

        if (hasImages === "true") {
            filter["images.0"] = { $exists: true };
        }

        // Aggregate statistics for this product across all approved reviews
        let stats = {
            averageRating: 5.0,
            totalReviews: 0,
            distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        };

        if (productId) {
            const allProductReviews = await Review.find({ productId: filter.productId, status: "approved" }, "rating").lean();
            if (allProductReviews.length > 0) {
                let sum = 0;
                const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
                for (const r of allProductReviews) {
                    const rVal = Math.round(Number(r.rating) || 5);
                    const clamped = Math.min(5, Math.max(1, rVal));
                    dist[clamped] = (dist[clamped] || 0) + 1;
                    sum += Number(r.rating) || 5;
                }
                stats = {
                    averageRating: Number((sum / allProductReviews.length).toFixed(1)),
                    totalReviews: allProductReviews.length,
                    distribution: dist
                };
            }
        }

        let query = Review.find(filter).sort({ createdAt: -1 });

        if (page && limit) {
            const pageNum = Math.max(1, parseInt(page, 10) || 1);
            const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
            query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
        }

        const reviews = await query.lean();

        // Map to format expected by client
        const formatted = reviews.map((r) => ({
            id: r._id.toString(),
            productId: r.productId,
            userName: r.userName || "Verified Buyer",
            userPhone: r.userPhone || "",
            rating: Number(r.rating) || 5,
            comment: r.comment || "",
            images: Array.isArray(r.images) ? r.images : [],
            createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString()
        }));

        res.status(200).json({
            success: true,
            count: formatted.length,
            stats,
            reviews: formatted
        });
    } catch (err) {
        console.error("Error fetching reviews from MongoDB:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/reviews
exports.createReview = async (req, res) => {
    try {
        const { productId, userName, userPhone, rating, comment, images } = req.body;

        if (!productId) {
            return res.status(400).json({ success: false, message: "productId is required" });
        }

        const ratingNum = Number(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ success: false, message: "rating must be between 1 and 5" });
        }

        const newReview = await Review.create({
            productId: String(productId).trim(),
            userName: (userName && userName.trim()) || "Verified Buyer",
            userPhone: (userPhone && userPhone.trim()) || "",
            rating: ratingNum,
            comment: (comment && comment.trim()) || "",
            images: Array.isArray(images) ? images : [],
            status: "approved",
            verifiedPurchase: true
        });

        res.status(201).json({
            success: true,
            review: {
                id: newReview._id.toString(),
                productId: newReview.productId,
                userName: newReview.userName,
                userPhone: newReview.userPhone,
                rating: newReview.rating,
                comment: newReview.comment,
                images: newReview.images,
                createdAt: newReview.createdAt.toISOString()
            }
        });
    } catch (err) {
        console.error("Error creating review in MongoDB:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// DELETE /api/reviews/:id
exports.deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        await Review.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Review deleted successfully" });
    } catch (err) {
        console.error("Error deleting review:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
