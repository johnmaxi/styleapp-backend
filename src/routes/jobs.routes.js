const express = require("express");
const router = express.Router();
const pool = require("../db/db");

// Obtener todos los jobs
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM jobs ORDER BY id DESC");
    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error obteniendo jobs" });
  }
});

// Cambiar estado de un job
router.patch("/:id/status", async (req, res) => {
  const jobId = req.params.id;
  const { status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *`,
      [status, jobId]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error actualizando el estado" });
  }
});

module.exports = router;