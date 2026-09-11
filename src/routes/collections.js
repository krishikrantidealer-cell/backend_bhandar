const express = require("express");
const router = express.Router();
const { getCollections, getCollectionBySlug } = require("../controllers/collectionController");

router.get("/", getCollections);
router.get("/:slug", getCollectionBySlug);

module.exports = router;
