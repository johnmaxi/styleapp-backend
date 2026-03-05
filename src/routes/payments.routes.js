// src/routes/payments.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/payments.controller");

// Generar link de pago Wompi
router.post("/wompi-link", auth, controller.createWompiLink);

// Resultado de pago — Wompi redirige aqui (no requiere auth)
router.get("/result", controller.paymentResult);

// Webhook de Wompi (no requiere auth)
router.post("/wompi-webhook", controller.wompiWebhook);

// Consultar saldo
router.get("/balance", auth, controller.getBalance);

module.exports = router;
