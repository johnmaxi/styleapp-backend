// src/routes/payments.routes.js
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth.middleware");
const ctrl    = require("../controllers/payments.controller");

// Crear preferencia MP (requiere auth)
router.post("/mp-preference", auth, ctrl.createMPPreference);

// Resultado de pago — MercadoPago redirige aqui (sin auth, es redirect del browser)
router.get("/mp-result", ctrl.mpResult);

// Webhook MP (sin auth)
router.post("/mp-webhook", ctrl.mpWebhook);

// Saldo del usuario
router.get("/balance", auth, ctrl.getBalance);

module.exports = router;
