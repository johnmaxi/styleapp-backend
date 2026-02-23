const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/serviceRequest.controller");

// Cliente: crear solicitud de servicio
router.post('/', auth, controller.create);

// Cliente: ver sus solicitudes
router.get('/mine', auth, controller.getMine);

// Barbero: ver solicitudes abiertas para ofertar
router.get('/open', auth, controller.getOpenForBarber);

// Barbero: ver servicios activos asignados (notificación de oferta aceptada)
router.get('/assigned/me', auth, controller.getAssignedForBarber);

// Cliente: ver una solicitud puntual
router.get('/:id', auth, controller.getById);

// Estado
router.patch('/:id/status', auth, controller.updateStatus);

module.exports = router;