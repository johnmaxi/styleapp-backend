// src/routes/ai.routes.js
const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/ai.controller");
const auth       = require("../middleware/auth.middleware");

// POST /ai/haircut-analysis
// Body: { image_base64: string, media_type?: string }
router.post("/haircut-analysis", auth, controller.analyzHaircut);

module.exports = router;
