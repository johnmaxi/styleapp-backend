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

    const historyRes = await pool.query(
      `SELECT ac.id, ac.service_id, ac.total_service, ac.commission_amt,
              ac.professional_amt, ac.payment_method, ac.payment_status,
              ac.notes, ac.created_at,
              u.name AS professional_name, u.role AS professional_role
       FROM app_commissions ac
       LEFT JOIN users u ON u.id = ac.professional_id
       WHERE ac.payment_status = 'completed'
         AND ac.created_at >= $1
         AND ac.created_at < ($2::date + INTERVAL '1 day')
       ORDER BY ac.created_at DESC
       LIMIT 200`,
      [dateFrom, dateTo]
    );

    const totalsRes = await pool.query(
      `SELECT COUNT(*) AS total_transacciones,
              COALESCE(SUM(total_service),    0) AS total_servicios,
              COALESCE(SUM(commission_amt),   0) AS saldo_app,
              COALESCE(SUM(professional_amt), 0) AS total_profesionales
       FROM app_commissions WHERE payment_status = 'completed'`
    );

    const filteredRes = await pool.query(
      `SELECT COUNT(*) AS total_transacciones,
              COALESCE(SUM(total_service),    0) AS total_servicios,
              COALESCE(SUM(commission_amt),   0) AS saldo_app,
              COALESCE(SUM(professional_amt), 0) AS total_profesionales
       FROM app_commissions
       WHERE payment_status = 'completed'
         AND created_at >= $1
         AND created_at < ($2::date + INTERVAL '1 day')`,
      [dateFrom, dateTo]
    );

    const byProfRes = await pool.query(
      `SELECT u.name AS barber_name, u.id AS barber_id,
              COUNT(*) AS completed_total,
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
      ok:              true,
      data:            byProfRes.rows,
      history:         historyRes.rows,
      totals:          totalsRes.rows[0],
      filtered_totals: filteredRes.rows[0],
      date_from:       dateFrom,
      date_to:         dateTo,
    });
  } catch (err) {
    console.error("ADMIN COMMISSIONS ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Profesionales pendientes de aprobación ────────────────────────────────
exports.getPendingProfessionals = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Solo administradores" });
    }
    const result = await pool.query(
      `SELECT id, name, email, role, phone, document_type, document_number,
              id_front, id_back, diploma, antecedentes_doc, profile_photo,
              created_at, registration_status
       FROM users
       WHERE registration_status = 'pending'
         AND role IN ('barber','estilista','quiropodologo')
       ORDER BY created_at ASC`
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Aprobar o rechazar profesional ────────────────────────────────────────
exports.reviewProfessional = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Solo administradores" });
    }
    const { professional_id } = req.params;
    const { action, reason }  = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Acción inválida" });
    }
    if (action === "reject" && !reason?.trim()) {
      return res.status(400).json({ ok: false, error: "Debes indicar el motivo del rechazo" });
    }

    const profRes = await pool.query(
      `SELECT id, name, email, role, push_token, registration_status FROM users WHERE id = $1`,
      [professional_id]
    );
    const prof = profRes.rows[0];
    if (!prof) return res.status(404).json({ ok: false, error: "Profesional no encontrado" });

    if (action === "approve") {
      await pool.query(
        `UPDATE users SET is_active = true, registration_status = 'approved',
                          registration_reviewed_at = NOW()
         WHERE id = $1`,
        [professional_id]
      );

      // Push notification
      if (prof.push_token) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            to: prof.push_token, sound: "default",
            title: "✅ Registro aprobado",
            body: "Tu cuenta ha sido aprobada. Ya puedes recibir servicios en StyleApp.",
            priority: "high", channelId: "styleapp-urgent",
          }]),
        }).catch(() => {});
      }

      // Email
      try {
        const emailService = require("../services/email.service");
        emailService.sendApprovalEmail({ name: prof.name, email: prof.email, role: prof.role }).catch(() => {});
      } catch {}

      return res.json({ ok: true, message: `Cuenta de ${prof.name} aprobada.` });

    } else {
      await pool.query(
        `UPDATE users SET registration_status = 'rejected',
                          registration_rejection_reason = $1,
                          registration_reviewed_at = NOW()
         WHERE id = $2`,
        [reason, professional_id]
      );

      if (prof.push_token) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            to: prof.push_token, sound: "default",
            title: "❌ Registro rechazado",
            body: `Tu registro fue rechazado. Motivo: ${reason}`,
            priority: "high", channelId: "styleapp-urgent",
          }]),
        }).catch(() => {});
      }

      try {
        const emailService = require("../services/email.service");
        emailService.sendRejectionEmail({ name: prof.name, email: prof.email, role: prof.role, reason }).catch(() => {});
      } catch {}

      return res.json({ ok: true, message: `Registro de ${prof.name} rechazado.` });
    }
  } catch (err) {
    console.error("REVIEW PROFESSIONAL ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
