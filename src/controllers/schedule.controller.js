// src/controllers/schedule.controller.js
const pool = require("../db/db");

// ── Agenda del profesional ────────────────────────────────────────────────
// Retorna servicios del profesional en un rango de fechas
exports.getProfessionalSchedule = async (req, res) => {
  try {
    const professional_id = req.user.id;
    const { from, to } = req.query;

    // Default: semana actual
    const dateFrom = from ? new Date(from) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() + 1); // lunes
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const dateTo = to ? (() => {
      // Forzar fin del día para incluir todos los servicios del último día
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      return d;
    })() : (() => {
      const d = new Date(dateFrom);
      d.setDate(d.getDate() + 6); // domingo
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    // Servicios programados en el rango
    const scheduled = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.status, sr.scheduled_at, sr.payment_method,
              sr.client_id, sr.updated_at, sr.completed_at,
              u.name AS client_name, u.phone AS client_phone
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.scheduled_at IS NOT NULL
         AND sr.scheduled_at BETWEEN $2 AND $3
       ORDER BY sr.scheduled_at ASC`,
      [professional_id, dateFrom, dateTo]
    );

    // Servicios "YA" completados en el rango (trazabilidad)
    const completed = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.status, sr.updated_at AS completed_at,
              sr.scheduled_at, sr.payment_method, sr.client_id,
              u.name AS client_name
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.scheduled_at IS NULL
         AND sr.status = 'completed'
         AND sr.updated_at BETWEEN $2 AND $3
       ORDER BY sr.updated_at DESC`,
      [professional_id, dateFrom, dateTo]
    );

    return res.json({
      ok: true,
      scheduled: scheduled.rows,
      completed: completed.rows,
      range: { from: dateFrom, to: dateTo },
    });
  } catch (err) {
    console.error("GET SCHEDULE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Verificar disponibilidad del profesional ─────────────────────────────
exports.checkAvailability = async (req, res) => {
  try {
    const { professional_id, scheduled_at } = req.query;
    if (!professional_id || !scheduled_at) {
      return res.status(400).json({ ok: false, error: "professional_id y scheduled_at requeridos" });
    }

    const schedDate = new Date(scheduled_at);
    const conflicts = await pool.query(
      `SELECT id, service_type, scheduled_at
       FROM service_request
       WHERE assigned_barber_id = $1
         AND status IN ('accepted','on_route','arrived')
         AND scheduled_at IS NOT NULL
         AND scheduled_at BETWEEN $2 - INTERVAL '2 hours'
                               AND $2 + INTERVAL '2 hours'`,
      [professional_id, schedDate]
    );

    return res.json({
      ok:        true,
      available: conflicts.rowCount === 0,
      conflicts: conflicts.rows,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Agenda del cliente ────────────────────────────────────────────────────
exports.getClientSchedule = async (req, res) => {
  try {
    const client_id = req.user.id;
    const { month, year } = req.query;

    const now   = new Date();
    const y     = Number(year)  || now.getFullYear();
    const m     = Number(month) || now.getMonth() + 1;
    const from  = new Date(y, m - 1, 1);
    const to    = new Date(y, m, 0, 23, 59, 59);

    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.status, sr.scheduled_at, sr.payment_method,
              sr.assigned_barber_id, sr.updated_at,
              u.name AS barber_name, u.phone AS barber_phone
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.assigned_barber_id
       WHERE sr.client_id = $1
         AND sr.scheduled_at IS NOT NULL
         AND sr.scheduled_at BETWEEN $2 AND $3
       ORDER BY sr.scheduled_at ASC`,
      [client_id, from, to]
    );

    return res.json({ ok: true, bookings: result.rows, month: m, year: y });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
