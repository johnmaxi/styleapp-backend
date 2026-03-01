// src/controllers/ratings.controller.js
const pool = require("../db/db");

exports.create = async (req, res) => {
  try {
    const { service_request_id, rated_id, score, comment } = req.body;
    const rater_id = req.user.id;

    if (!service_request_id || !rated_id || !score) {
      return res.status(400).json({ ok: false, error: "service_request_id, rated_id y score son obligatorios" });
    }
    if (score < 1 || score > 5) {
      return res.status(400).json({ ok: false, error: "El score debe ser entre 1 y 5" });
    }

    const srResult = await pool.query(
      `SELECT * FROM service_request WHERE id=$1`,
      [service_request_id]
    );
    if (srResult.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }

    await pool.query(
      `INSERT INTO ratings (service_request_id, rater_id, rated_id, score, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (service_request_id, rater_id) DO UPDATE SET score=$4, comment=$5`,
      [service_request_id, rater_id, rated_id, score, comment || null]
    );

    const avgResult = await pool.query(
      `SELECT AVG(score)::NUMERIC(3,2) as avg, COUNT(*) as cnt FROM ratings WHERE rated_id=$1`,
      [rated_id]
    );
    const avg = avgResult.rows[0].avg || 0;
    const cnt = avgResult.rows[0].cnt || 0;

    await pool.query(
      `UPDATE users SET rating=$1, rating_count=$2 WHERE id=$3`,
      [avg, cnt, rated_id]
    );

    return res.status(201).json({ ok: true, message: "Calificación guardada", avg, cnt });
  } catch (err) {
    console.error("🔥 ERROR CREAR RATING:", err);
    return res.status(500).json({ ok: false, error: "Error guardando calificación" });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      `SELECT r.*, u.name as rater_name
       FROM ratings r
       JOIN users u ON u.id = r.rater_id
       WHERE r.rated_id=$1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("🔥 ERROR GET RATINGS:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo calificaciones" });
  }
};
