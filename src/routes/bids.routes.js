const express = require("express");
const router = express.Router();

const controller = require("../controllers/bids.controller");
const auth = require("../middleware/auth.middleware");

// Crear oferta (barbero)
router.post("/", auth, controller.createBid);

// Cliente ve ofertas
router.get("/request/:id", auth, controller.getByRequest);

// Cliente acepta oferta
router.patch("/accept/:bidId", auth, controller.acceptBid);

module.exports = router;