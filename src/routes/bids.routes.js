// src/routes/bids.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/bids.controller");
const auth = require("../middleware/auth.middleware");

// Crear oferta (cualquier profesional)
router.post("/", auth, controller.createBid);

// Cliente ve ofertas de una solicitud
router.get("/request/:id", auth, controller.getByRequest);

// Profesional ve sus ofertas en una solicitud específica
router.get("/barber/request/:id", auth, controller.getByRequestForBarber);

// Profesional ve TODAS sus ofertas (para notificaciones de rechazo/aceptación)
router.get("/my-bids", auth, controller.getMyBids);

// Cliente acepta oferta
router.patch("/accept/:bidId", auth, controller.acceptBid);

// Cliente rechaza oferta
router.patch("/reject/:bidId", auth, controller.rejectBid);

module.exports = router;
