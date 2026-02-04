const express = require("express");
const router = express.Router();
const User = require("../models/user.model");

// GET /usuarios/me/:id
router.get("/me/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ ok: true, user });
  } catch (error) {
    console.error("❌ Error usuario:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

module.exports = router;
