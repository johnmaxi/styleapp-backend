const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/serviceRequest.controller');

/* ==============================
   CLIENTE
============================== */

// Crear solicitud
router.post('/', auth, controller.create);

// Listar solicitudes del cliente autenticado
router.get('/', auth, controller.list);

/* ==============================
   BARBERO
============================== */

// Ver solicitudes abiertas
router.get('/open', auth, controller.listOpen);

/* ==============================
   ESTADO
============================== */

// Actualizar estado
router.patch('/:id/status', auth, controller.updateStatus);

module.exports = router;