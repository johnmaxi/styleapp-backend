// src/routes/ratings.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/ratings.controller");

router.post("/", auth, controller.create);
router.get("/user/:userId", auth, controller.getByUser);

module.exports = router;
