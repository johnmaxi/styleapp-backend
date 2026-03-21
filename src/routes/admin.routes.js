// src/routes/admin.routes.js
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth.middleware");
const ctrl    = require("../controllers/admin.controller");

router.get("/commissions", auth, ctrl.getCommissions);

module.exports = router;
