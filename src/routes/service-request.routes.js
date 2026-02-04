const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const controller = require('../controllers/serviceRequest.controller');

router.post('/', auth, controller.create);
router.get('/', auth, controller.list);

module.exports = router;