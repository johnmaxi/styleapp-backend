// src/routes/auth.routes.js
const express    = require("express");
const router     = express.Router();
const auth       = require("../middleware/auth.middleware");
const controller = require("../controllers/auth.controller");

// ── Públicas ──────────────────────────────────────────────────────────────
router.post("/register", controller.register);
router.post("/login",    controller.login);

// ── Admin — gestión de registros de profesionales ─────────────────────────
router.get( "/pending-professionals",                auth, controller.getPendingProfessionals);
router.post("/review-professional/:professional_id", auth, controller.reviewProfessional);

module.exports = router;
