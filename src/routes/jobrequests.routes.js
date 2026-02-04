const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');

let requests = [];
let id = 1;

router.post('/', auth, (req, res) => {
  const data = { id: id++, ...req.body, status: 'open' };
  requests.push(data);
  res.json({ ok: true, message: 'Service request creado', data });
});

router.get('/', auth, (req, res) => {
  res.json({ ok: true, data: requests });
});

module.exports = router;