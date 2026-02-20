require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const serviceRequestRoutes = require("./src/routes/service-request.routes");
const bidsRoutes = require("./src/routes/bids.routes");

const app = express();


app.use(cors());
app.use(express.json());


// Rutas versionadas (recomendadas)
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", userRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/bids", bidsRoutes);

// Compatibilidad MVP (clientes existentes)
app.use("/auth", authRoutes);
app.use("/usuarios", userRoutes);
app.use("/service-request", serviceRequestRoutes);
app.use("/bids", bidsRoutes);


app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "🔥 StyleApp API funcionando correctamente",
  });
});


app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Endpoint no encontrado",
  });
});


app.use((err, req, res, next) => {
  console.error("🔥 ERROR GLOBAL:", err);

  res.status(err.status || 500).json({
    ok: false,
    error: err.message || "Error interno del servidor",
  });
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔥 Backend corriendo en http://localhost:${PORT}`);
});