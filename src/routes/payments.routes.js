// src/routes/payments.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/payments.controller");

// Generar link de pago Wompi (requiere autenticacion)
router.post("/wompi-link", auth, controller.createWompiLink);

// Webhook de Wompi — NO requiere auth (viene de Wompi directamente)
router.post("/wompi-webhook", controller.wompiWebhook);

// Consultar saldo
router.get("/balance", auth, controller.getBalance);

module.exports = router;
