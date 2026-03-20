// Agregar estas rutas en server.js o en un archivo src/routes/notifications.routes.js

// src/routes/notifications.routes.js
const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/auth.middleware");
const ctrl    = require("../controllers/notifications.controller");

router.post("/push-token",       auth, ctrl.savePushToken);
router.post("/update-location",  auth, ctrl.updateLocation);

module.exports = router;

// ── En server.js agregar: ─────────────────────────────────────────────────
// const notifRoutes = require("./src/routes/notifications.routes");
// app.use("/api/notifications", notifRoutes);
// app.use("/notifications",     notifRoutes);
