const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/serviceRequest.controller');

// Crear solicitud
router.post('/', auth, controller.create);

router.patch("/:id/status", auth, controller.updateStatus);

// Listar solicitudes del cliente autenticado
router.get('/', auth, controller.list);

module.exports = router;
