// src/routes/recharge.routes.js
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth.middleware");
const ctrl    = require("../controllers/recharge.controller");

// Profesional
router.post("/recharge-request",      auth, ctrl.createRechargeRequest);
router.get("/recharge-requests/mine", auth, ctrl.getMyRechargeRequests);
router.get("/balance",                auth, ctrl.getMyBalance);

// Admin
router.get("/admin/recharge-requests",            auth, ctrl.adminGetRechargeRequests);
router.post("/admin/recharge-requests/:id/approve", auth, ctrl.adminApproveRecharge);
router.post("/admin/recharge-requests/:id/reject",  auth, ctrl.adminRejectRecharge);

module.exports = router;
