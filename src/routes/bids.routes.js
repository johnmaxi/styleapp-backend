const express = require("express");
const router = express.Router();

const controller = require("../controllers/bids.controller");
const auth = require("../middleware/auth.middleware");

// Crear oferta (barbero)
router.post("/", auth, controller.createBid);

// Cliente ve ofertas de una solicitud
router.get("/request/:id", auth, controller.getByRequest);

// Barbero ve sus ofertas por solicitud (notificación de aceptada/rechazada)
router.get("/barber/request/:id", auth, controller.getByRequestForBarber);

// Cliente acepta oferta
router.patch("/accept/:bidId", auth, controller.acceptBid);

// Cliente rechaza oferta
router.patch("/reject/:bidId", auth, controller.rejectBid);

module.exports = router;