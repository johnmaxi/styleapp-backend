require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");

const app = express();

app.use(cors());
app.use(express.json());

// rutas
app.use("/auth", authRoutes);
app.use("/usuarios", userRoutes);

// test
app.get("/", (req, res) => {
  res.json({ ok: true, message: "API principal funcionando" });
});

app.listen(3000, () => {
  console.log("🔥 Backend corriendo en http://localhost:3000");
});