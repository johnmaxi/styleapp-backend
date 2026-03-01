// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const serviceRequestRoutes = require("./src/routes/service-request.routes");
const bidsRoutes = require("./src/routes/bids.routes");
const ratingsRoutes = require("./src/routes/ratings.routes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Rutas con prefijo /api/
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", userRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/bids", bidsRoutes);
app.use("/api/ratings", ratingsRoutes);

// Compatibilidad sin prefijo /api
app.use("/auth", authRoutes);
app.use("/usuarios", userRoutes);
app.use("/service-request", serviceRequestRoutes);
app.use("/service-requests", serviceRequestRoutes);
app.use("/bids", bidsRoutes);
app.use("/ratings", ratingsRoutes);

app.get("/", (req, res) => {
  res.json({ ok: true, message: "🔥 StyleApp API v2 funcionando" });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Endpoint no encontrado: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error("🔥 ERROR GLOBAL:", err);
  res.status(err.status || 500).json({ ok: false, error: err.message || "Error interno" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Backend corriendo en http://localhost:${PORT}`);
});
