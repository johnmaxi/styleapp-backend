// src/routes/schedule.routes.js
const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/auth.middleware");
const ctrl     = require("../controllers/schedule.controller");

router.get("/professional", auth, ctrl.getProfessionalSchedule);
router.get("/availability",       ctrl.checkAvailability);
router.get("/client",       auth, ctrl.getClientSchedule);

module.exports = router;
