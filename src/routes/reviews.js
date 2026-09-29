const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");

// Public routes for fetching and posting reviews
router.get("/", reviewController.getReviews);
router.post("/", reviewController.createReview);
router.delete("/:id", reviewController.deleteReview);

module.exports = router;
