// src/routes/service-request.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const controller = require("../controllers/serviceRequest.controller");

router.post("/",               auth, controller.create);
router.get("/mine",            auth, controller.getMine);
router.get("/my-history",      auth, controller.getHistoryForProfessional);
router.get("/open",            auth, controller.getOpenForBarber);
router.get("/assigned/me",     auth, controller.getAssignedForBarber);
router.get("/active-status",   auth, controller.getActiveStatus);
router.patch("/toggle-active", auth, controller.toggleActive);
router.get("/:id",             auth, controller.getById);
router.patch("/:id/status",    auth, controller.updateStatus);

module.exports = router;
