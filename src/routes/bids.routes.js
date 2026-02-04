const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const controller = require('../controllers/bids.controller');

router.post('/', auth, controller.create);
router.get('/request/:id', auth, controller.listByRequest);

module.exports = router;
