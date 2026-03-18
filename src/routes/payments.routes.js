// src/routes/payments.routes.js
const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/auth.middleware");

const paymentsCtrl    = require("../controllers/payments.controller");
const svcPaymentsCtrl = require("../controllers/service-payments.controller"); // NUEVO

// ── Recargas de saldo (MercadoPago) ──────────────────────────────────────
router.post("/mp-preference",   auth, paymentsCtrl.createMPPreference);
router.get( "/mp-result",             paymentsCtrl.mpResult);
router.post("/mp-webhook",            paymentsCtrl.mpWebhook);
router.get( "/balance",         auth, paymentsCtrl.getBalance);

// ── Pagos de servicios con lógica de comisiones ───────────────────────────
router.post("/finalize-service/:service_id", auth, svcPaymentsCtrl.finalizeService);
router.get( "/check-balance/:service_id",    auth, svcPaymentsCtrl.checkClientBalance);
router.post("/service-payment/:service_id",  auth, svcPaymentsCtrl.createServicePayment);
router.get( "/service-result",                     svcPaymentsCtrl.servicePaymentResult);

module.exports = router;
