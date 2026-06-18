// src/controllers/recharge.controller.js
const pool = require("../db/db");

// ── Profesional crea solicitud de recarga ──────────────────────────────
exports.createRechargeRequest = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, error: "No autenticado" });
    const { amount, receipt, notes } = req.body;

    if (!amount || Number(amount) < 5000) {
      return res.status(400).json({ ok: false, error: "El monto mínimo de recarga es $5.000 COP" });
    }
    if (!receipt) {
      return res.status(400).json({ ok: false, error: "Debes adjuntar el comprobante de pago" });
    }

    const result = await pool.query(
      `INSERT INTO recharge_requests (user_id, amount, receipt, notes, status)
       VALUES ($1,$2,$3,$4,'pending') RETURNING id, amount, status, created_at`,
      [req.user.id, Number(amount), receipt, notes || null]
    );

    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("createRechargeRequest error:", err);
    return res.status(500).json({ ok: false, error: "Error creando solicitud de recarga" });
  }
};

// ── Profesional ve sus propias solicitudes ──────────────────────────────
exports.getMyRechargeRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, amount, status, notes, reject_reason, created_at, reviewed_at
       FROM recharge_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

// ── Admin ve solicitudes pendientes ──────────────────────────────────────
exports.adminGetRechargeRequests = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });

    const { status } = req.query;
    let query = `
      SELECT r.*, u.name as user_name, u.email as user_email, u.role as user_role, u.phone as user_phone
      FROM recharge_requests r
      JOIN users u ON u.id = r.user_id
    `;
    const params = [];
    if (status) {
      params.push(status);
      query += ` WHERE r.status = $1`;
    }
    query += ` ORDER BY r.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("adminGetRechargeRequests error:", err);
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

// ── Admin aprueba recarga — suma saldo al usuario ───────────────────────
exports.adminApproveRecharge = async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });

    const { id } = req.params;

    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT * FROM recharge_requests WHERE id=$1 FOR UPDATE`, [id]
    );
    const rechargeReq = reqRes.rows[0];
    if (!rechargeReq) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }
    if (rechargeReq.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "Esta solicitud ya fue procesada" });
    }

    // Sumar saldo al usuario
    await client.query(
      `UPDATE users SET balance = balance + $1 WHERE id=$2`,
      [rechargeReq.amount, rechargeReq.user_id]
    );

    // Marcar como aprobada
    await client.query(
      `UPDATE recharge_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW() WHERE id=$2`,
      [req.user.id, id]
    );

    await client.query("COMMIT");

    // Notificar al profesional
    try {
      const userRes = await pool.query(`SELECT push_token FROM users WHERE id=$1`, [rechargeReq.user_id]);
      const token = userRes.rows[0]?.push_token;
      if (token) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            to: token, sound: "default",
            title: "✅ Recarga aprobada",
            body: `Tu recarga de $${Number(rechargeReq.amount).toLocaleString("es-CO")} COP fue aprobada.`,
            priority: "high",
            channelId: "styleapp-notifications",
          }]),
        });
      }
    } catch {}

    return res.json({ ok: true, message: "Recarga aprobada y saldo actualizado" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("adminApproveRecharge error:", err);
    return res.status(500).json({ ok: false, error: "Error aprobando recarga" });
  } finally {
    client.release();
  }
};

// ── Admin rechaza recarga ────────────────────────────────────────────────
exports.adminRejectRecharge = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });

    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(
      `UPDATE recharge_requests
       SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), reject_reason=$2
       WHERE id=$3 AND status='pending' RETURNING *`,
      [req.user.id, reason || "No especificado", id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada o ya procesada" });

    // Notificar
    try {
      const rechargeReq = result.rows[0];
      const userRes = await pool.query(`SELECT push_token FROM users WHERE id=$1`, [rechargeReq.user_id]);
      const token = userRes.rows[0]?.push_token;
      if (token) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            to: token, sound: "default",
            title: "❌ Recarga rechazada",
            body: reason || "Tu solicitud de recarga fue rechazada.",
            priority: "high",
            channelId: "styleapp-notifications",
          }]),
        });
      }
    } catch {}

    return res.json({ ok: true, message: "Recarga rechazada" });
  } catch (err) {
    console.error("adminRejectRecharge error:", err);
    return res.status(500).json({ ok: false, error: "Error rechazando recarga" });
  }
};

// ── Obtener saldo del usuario actual ─────────────────────────────────────
exports.getMyBalance = async (req, res) => {
  try {
    const result = await pool.query(`SELECT balance FROM users WHERE id=$1`, [req.user.id]);
    return res.json({ ok: true, balance: Number(result.rows[0]?.balance || 0) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};
