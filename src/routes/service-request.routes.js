const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/serviceRequest.controller");

// Barbero: ver servicios activos asignados (notificación de oferta aceptada)
router.get("/assigned/me", auth, controller.getAssignedForBarber);

// Estado
router.patch("/:id/status", auth, controller.updateStatus);

module.exports = router;