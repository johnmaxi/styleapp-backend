// src/routes/store.routes.js
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth.middleware");
const ctrl    = require("../controllers/store.controller");

// ── Públicas (requieren auth para saber quién compra) ──
router.get("/products",           auth, ctrl.getProducts);
router.get("/products/:id",       auth, ctrl.getProductById);
router.post("/orders",            auth, ctrl.createOrder);
router.get("/orders/mine",        auth, ctrl.getMyOrders);

// ── Admin ──
router.get("/admin/products",         auth, ctrl.adminGetProducts);
router.post("/admin/products",        auth, ctrl.adminCreateProduct);
router.put("/admin/products/:id",     auth, ctrl.adminUpdateProduct);
router.delete("/admin/products/:id",  auth, ctrl.adminDeleteProduct);
router.get("/admin/orders",           auth, ctrl.adminGetOrders);
router.patch("/admin/orders/:id/status", auth, ctrl.adminUpdateOrderStatus);

module.exports = router;
