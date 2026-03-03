// src/routes/bids.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/bids.controller");
const auth = require("../middleware/auth.middleware");

router.post("/", auth, controller.createBid);
router.get("/request/:id", auth, controller.getByRequest);
router.get("/barber/request/:id", auth, controller.getByRequestForBarber);

// Para inicio: solo pending/accepted, excluye cancelados y completados
router.get("/my-bids", auth, controller.getMyBids);

// Para pantalla "Mis ofertas": historial completo
router.get("/my-bids/all", auth, controller.getMyBidsAll);

router.patch("/accept/:bidId", auth, controller.acceptBid);
router.patch("/reject/:bidId", auth, controller.rejectBid);

module.exports = router;
