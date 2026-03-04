// src/routes/service-request.routes.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/serviceRequest.controller");

// Cliente: crear solicitud de servicio
router.post("/", auth, controller.create);

// Cliente: ver sus solicitudes activas
router.get("/mine", auth, controller.getMine);

// Profesional: historial de servicios completados/cancelados
// IMPORTANTE: debe ir ANTES de /:id para que no se confunda con un ID
router.get("/my-history", auth, controller.getHistoryForProfessional);

// Profesional: ver solicitudes abiertas para ofertar
router.get("/open", auth, controller.getOpenForBarber);

// Profesional: ver servicios activos asignados
router.get("/assigned/me", auth, controller.getAssignedForBarber);

// Cliente / Profesional: ver una solicitud por ID
router.get("/:id", auth, controller.getById);

// Actualizar estado
router.patch("/:id/status", auth, controller.updateStatus);

module.exports = router;
