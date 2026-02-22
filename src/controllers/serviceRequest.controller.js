const pool = require("../db/db");

exports.getAssignedForBarber = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "barber") {
      return res.status(403).json({ ok: false, error: "Solo barberos" });
    }

    const result = await pool.query(
      `SELECT *
       FROM service_request
       WHERE assigned_barber_id=$1
         AND status IN ('accepted','on_route')
       ORDER BY id DESC`,
      [req.user.id]
    );

    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("🔥 ERROR ASSIGNED BARBER:", err);
    return res.status(500).json({ ok: false, error: "Error listando servicios asignados" });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["open", "accepted", "on_route", "completed", "cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ ok: false, error: "Estado inválido" });
    }

    await pool.query(`UPDATE service_request SET status=$1 WHERE id=$2`, [status, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("🔥 ERROR UPDATE STATUS:", err);
    return res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
};