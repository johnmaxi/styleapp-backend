// src/routes/payments.routes.js
const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/auth.middleware");
const paymentsCtrl    = require("../controllers/payments.controller");
const svcPaymentsCtrl = require("../controllers/service-payments.controller");

// ── Saldo del usuario ──────────────────────────────────────────────────
router.get("/balance", auth, paymentsCtrl.getBalance);

// ── Verificar si profesional puede aceptar servicios (saldo negativo) ──
router.get("/can-accept-services", auth, svcPaymentsCtrl.checkCanAcceptServices);

// ── Finalización de servicio con comisiones ─────────────────────────────
router.post("/finalize-service/:service_id", auth, svcPaymentsCtrl.finalizeService);

// ── Cancelación de servicio con penalización ────────────────────────────
router.post("/cancel-service/:service_id",              auth, svcPaymentsCtrl.cancelService);
router.post("/cancel-service-professional/:service_id", auth, svcPaymentsCtrl.cancelServiceByProfessional);

module.exports = router;
