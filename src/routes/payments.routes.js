// src/routes/payments.routes.js
const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/auth.middleware");

const paymentsCtrl    = require("../controllers/payments.controller");
const svcPaymentsCtrl = require("../controllers/service-payments.controller");

// ── Recargas de saldo (MercadoPago) ──────────────────────────────────────
router.post("/mp-preference",   auth, paymentsCtrl.createMPPreference);
router.get( "/mp-result",             paymentsCtrl.mpResult);
router.post("/mp-webhook",            paymentsCtrl.mpWebhook);
router.get( "/balance",         auth, paymentsCtrl.getBalance);

// ── Pago anticipado de servicio PSE/Tarjeta ───────────────────────────────
router.post("/service-checkout",                    auth, svcPaymentsCtrl.createServiceCheckout);
router.get( "/verify-service-payment/:reference",   auth, svcPaymentsCtrl.verifyServicePayment);
router.get( "/service-result",                            svcPaymentsCtrl.servicePaymentResult);

// ── Finalización de servicio con comisiones ───────────────────────────────
router.post("/finalize-service/:service_id", auth, svcPaymentsCtrl.finalizeService);
router.get( "/check-balance/:service_id",    auth, svcPaymentsCtrl.checkClientBalance);

module.exports = router;
