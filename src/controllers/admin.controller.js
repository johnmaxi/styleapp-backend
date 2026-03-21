// src/controllers/admin.controller.js
const pool = require("../db/db");

// ── Comisiones con filtro de fechas ───────────────────────────────────────
exports.getCommissions = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Solo administradores" });
    }

    const { from, to } = req.query;
    const dateFrom = from || "2024-01-01";
    const dateTo   = to   || new Date().toISOString().split("T")[0];

    // Histórico detallado
    const historyRes = await pool.query(
      `SELECT 
         ac.id,
         ac.service_id,
         ac.total_service,
         ac.commission_amt,
         ac.professional_amt,
         ac.payment_method,
         ac.payment_status,
         ac.notes,
         ac.created_at,
         u.name  AS professional_name,
         u.role  AS professional_role
       FROM app_commissions ac
       LEFT JOIN users u ON u.id = ac.professional_id
       WHERE ac.payment_status = 'completed'
         AND ac.created_at >= $1
         AND ac.created_at < ($2::date + INTERVAL '1 day')
       ORDER BY ac.created_at DESC
       LIMIT 200`,
      [dateFrom, dateTo]
    );

    // Totales generales
    const totalsRes = await pool.query(
      `SELECT
         COUNT(*)                  AS total_transacciones,
         COALESCE(SUM(total_service),    0) AS total_servicios,
         COALESCE(SUM(commission_amt),   0) AS saldo_app,
         COALESCE(SUM(professional_amt), 0) AS total_profesionales
       FROM app_commissions
       WHERE payment_status = 'completed'`
    );

    // Totales filtrados por fecha
    const filteredTotalsRes = await pool.query(
      `SELECT
         COUNT(*)                  AS total_transacciones,
         COALESCE(SUM(total_service),    0) AS total_servicios,
         COALESCE(SUM(commission_amt),   0) AS saldo_app,
         COALESCE(SUM(professional_amt), 0) AS total_profesionales
       FROM app_commissions
       WHERE payment_status = 'completed'
         AND created_at >= $1
         AND created_at < ($2::date + INTERVAL '1 day')`,
      [dateFrom, dateTo]
    );

    // Por profesional (filtrado)
    const byProfRes = await pool.query(
      `SELECT
         u.name          AS barber_name,
         u.id            AS barber_id,
         COUNT(*)        AS completed_total,
         COALESCE(SUM(ac.commission_amt), 0) AS commission_total,
         COALESCE(SUM(ac.total_service),  0) AS revenue_total
       FROM app_commissions ac
       JOIN users u ON u.id = ac.professional_id
       WHERE ac.payment_status = 'completed'
         AND ac.created_at >= $1
         AND ac.created_at < ($2::date + INTERVAL '1 day')
       GROUP BY u.id, u.name
       ORDER BY commission_total DESC`,
      [dateFrom, dateTo]
    );

    return res.json({
      ok:             true,
      data:           byProfRes.rows,       // por profesional (compatibilidad)
      history:        historyRes.rows,      // histórico detallado
      totals:         totalsRes.rows[0],    // totales globales
      filtered_totals: filteredTotalsRes.rows[0], // totales en rango
      date_from:      dateFrom,
      date_to:        dateTo,
    });
  } catch (err) {
    console.error("ADMIN COMMISSIONS ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
