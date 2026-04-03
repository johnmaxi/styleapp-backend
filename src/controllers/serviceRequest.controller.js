// src/controllers/serviceRequest.controller.js
const pool = require("../db/db");

const PROFESSIONAL_ROLES = ["barber", "estilista", "quiropodologo"];
const roleToProType = {
  barber:        "profesional",
  estilista:     "estilista",
  quiropodologo: "quiropodologo",
};

exports.create = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes pueden crear solicitudes" });
    }
    const {
      service_type, address, latitude, longitude,
      price, professional_type, payment_method, mp_reference,
      scheduled_at, scheduling_notes,
    } = req.body;

    if (!service_type || !address || !price) {
      return res.status(400).json({ ok: false, error: "Faltan campos obligatorios" });
    }

    const isScheduled = !!scheduled_at;

    // ── Validar límite: 1 servicio YA activo por cliente ─────────────────
    if (!isScheduled) {
      const hasActiveYA = await pool.query(
        `SELECT id FROM service_request
         WHERE client_id = $1
           AND status IN ('open','accepted','on_route','arrived')
           AND scheduled_at IS NULL
         LIMIT 1`,
        [req.user.id]
      );
      if (hasActiveYA.rowCount > 0) {
        return res.status(400).json({
          ok: false,
          error: "Ya tienes un servicio activo. Debes finalizarlo o cancelarlo antes de solicitar uno nuevo.",
          active_service_id: hasActiveYA.rows[0].id,
        });
      }
    }

    // ── PSE/Tarjeta: verificar pago anticipado ────────────────────────────
    const MP_METHODS = ["pse", "tarjeta"];
    let payment_status = "pending";

    if (MP_METHODS.includes(payment_method)) {
      if (!mp_reference) {
        return res.status(400).json({
          ok: false,
          error: "Para PSE/Tarjeta debes completar el pago por MercadoPago primero",
        });
      }
      const txRes = await pool.query(
        `SELECT status FROM transactions WHERE reference = $1 AND user_id = $2`,
        [mp_reference, req.user.id]
      );
      const tx = txRes.rows[0];
      if (!tx || tx.status !== "approved") {
        return res.status(400).json({
          ok: false,
          error: "El pago no fue confirmado. Completa el pago en MercadoPago antes de publicar.",
        });
      }
      payment_status = "paid";
    }

    // ── Status inicial:
    // - Servicio YA     → 'open'       (se publica inmediatamente)
    // - Servicio agendado → 'scheduled' (se activa 1h antes con el cron)
    const initialStatus = isScheduled ? "scheduled" : "open";

    // ── expires_at solo para servicios YA (no aplica a agendados) ─────────
    const expiresAt = isScheduled ? null : "NOW() + INTERVAL '10 minutes'";

    const result = await pool.query(
      `INSERT INTO service_request
       (client_id, service_type, address, latitude, longitude, price,
        professional_type, payment_method, payment_status, status,
        scheduled_at, scheduling_notes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         ${isScheduled ? "NULL" : "NOW() + INTERVAL '10 minutes'"})
       RETURNING *`,
      [
        req.user.id, service_type, address,
        latitude || null, longitude || null,
        price, professional_type || null,
        payment_method || null, payment_status,
        initialStatus,
        scheduled_at || null,
        scheduling_notes || null,
      ]
    );

    const newService = result.rows[0];

    // ── Notificar profesionales cercanos solo para servicios YA ───────────
    if (!isScheduled) {
      try {
        const { notifyNearbyProfessionals } = require("./notifications.controller");
        notifyNearbyProfessionals(newService).catch((err) =>
          console.warn("notifyNearbyProfessionals error:", err.message)
        );
      } catch (e) {
        console.warn("No se pudo importar notifications.controller:", e.message);
      }
    }

    return res.status(201).json({ ok: true, data: newService });
  } catch (err) {
    console.error("ERROR CREATE:", err);
    return res.status(500).json({ ok: false, error: "Error creando solicitud" });
  }
};

exports.getMine = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }
    const result = await pool.query(
      `SELECT sr.*, u.name as barber_name
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.assigned_barber_id
       WHERE sr.client_id = $1
       ORDER BY sr.requested_at DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR GET MINE:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitudes" });
  }
};

exports.getOpenForBarber = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }

    const userResult = await pool.query(
      `SELECT is_active FROM users WHERE id=$1`, [req.user.id]
    );
    if (userResult.rows[0]?.is_active === false) {
      return res.json([]);
    }

    const proType = roleToProType[req.user.role];

    // Retornar servicios YA (open) Y servicios programados (scheduled)
    // El profesional puede ver y ofertar/aceptar ambos
    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.latitude, sr.longitude, sr.status, sr.professional_type,
              sr.payment_method, sr.requested_at, sr.scheduled_at,
              sr.scheduling_notes, sr.client_id
       FROM service_request sr
       WHERE sr.status IN ('open', 'scheduled')
         AND sr.professional_type = $1
       ORDER BY
         CASE WHEN sr.scheduled_at IS NULL THEN 0 ELSE 1 END,
         sr.requested_at DESC
       LIMIT 50`,
      [proType]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR GET OPEN:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitudes" });
  }
};

exports.getAssignedForBarber = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.status, sr.payment_method, sr.client_id,
              sr.latitude, sr.longitude, sr.requested_at,
              sr.scheduled_at,
              u.name as client_name, u.phone as client_phone
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.status IN ('accepted', 'on_route', 'arrived')
       ORDER BY sr.requested_at DESC LIMIT 5`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR GET ASSIGNED:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo servicios asignados" });
  }
};

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT sr.*, u.name as barber_name, u.phone as barber_phone
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.assigned_barber_id
       WHERE sr.id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("ERROR GET BY ID:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitud" });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const VALID = ["open","scheduled","accepted","on_route","arrived","completed","cancelled"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ ok: false, error: "Estado invalido" });
    }
    const existing = await pool.query(
      `SELECT * FROM service_request WHERE id=$1`, [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }
    const sr     = existing.rows[0];
    const userId = Number(req.user.id);

    if (status === "cancelled" && Number(sr.client_id) !== userId) {
      return res.status(403).json({ ok: false, error: "Solo el cliente puede cancelar" });
    }
    if (["on_route","arrived","completed"].includes(status) &&
        Number(sr.assigned_barber_id) !== userId) {
      return res.status(403).json({
        ok: false, error: "Solo el profesional asignado puede actualizar el estado",
      });
    }

    await pool.query(
      `UPDATE service_request SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, id]
    );
    return res.json({ ok: true, status });
  } catch (err) {
    console.error("ERROR UPDATE STATUS:", err);
    return res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
};

exports.getHistoryForProfessional = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.payment_method, sr.status, sr.requested_at, sr.scheduled_at,
              u.name as client_name
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.status IN ('completed', 'cancelled')
       ORDER BY sr.requested_at DESC LIMIT 100`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR GET HISTORY:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo historial" });
  }
};

exports.toggleActive = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const current = await pool.query(
      `SELECT is_active FROM users WHERE id=$1`, [req.user.id]
    );
    const newActive = !current.rows[0]?.is_active;
    await pool.query(
      `UPDATE users SET is_active=$1 WHERE id=$2`, [newActive, req.user.id]
    );
    return res.json({ ok: true, is_active: newActive });
  } catch (err) {
    console.error("ERROR TOGGLE ACTIVE:", err);
    return res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
};

exports.getActiveStatus = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false });
    const result = await pool.query(
      `SELECT is_active FROM users WHERE id=$1`, [req.user.id]
    );
    return res.json({ ok: true, is_active: result.rows[0]?.is_active ?? true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};