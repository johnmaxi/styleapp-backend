// src/controllers/serviceRequest.controller.js
const pool = require("../db/db");

const PROFESSIONAL_ROLES = ["barber", "estilista", "quiropodologo"];

const roleToProType = {
  barber: "profesional",
  estilista: "estilista",
  quiropodologo: "quiropodologo",
};

// -------------------------------------------------------
// CLIENTE: Crear solicitud de servicio
// -------------------------------------------------------
exports.create = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes pueden crear solicitudes" });
    }

    const {
      service_type,
      professional_type,
      price,
      address,
      latitude,
      longitude,
      payment_method,
    } = req.body;

    if (!service_type || !price) {
      return res.status(400).json({ ok: false, error: "service_type y price son obligatorios" });
    }
    if (!professional_type) {
      return res.status(400).json({
        ok: false,
        error: "professional_type es obligatorio (profesional, estilista, quiropodologo)",
      });
    }

    const result = await pool.query(
      `INSERT INTO service_request
       (client_id, service_type, professional_type, price, address,
        latitude, longitude, payment_method, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')
       RETURNING *`,
      [
        req.user.id,
        service_type,
        professional_type,
        Number(price),
        address || null,
        latitude ?? null,
        longitude ?? null,
        payment_method || null,
      ]
    );

    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("ERROR CREATE SERVICE REQUEST:", err);
    return res.status(500).json({ ok: false, error: "Error creando solicitud de servicio" });
  }
};

// -------------------------------------------------------
// CLIENTE: Ver sus propias solicitudes activas
// -------------------------------------------------------
exports.getMine = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }
    const result = await pool.query(
      `SELECT * FROM service_request WHERE client_id=$1 ORDER BY id DESC`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR GET MINE:", err);
    return res.status(500).json({ ok: false, error: "Error listando solicitudes" });
  }
};

// -------------------------------------------------------
// PROFESIONAL: Historial de servicios completados/cancelados
// -------------------------------------------------------
exports.getHistoryForProfessional = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price, sr.status,
              sr.payment_method, sr.professional_type, sr.created_at,
              u.name AS client_name
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.status IN ('completed', 'cancelled')
       ORDER BY sr.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR GET HISTORY:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo historial" });
  }
};

// -------------------------------------------------------
// PROFESIONAL: Ver solicitudes abiertas disponibles
// -------------------------------------------------------
exports.getOpenForBarber = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const proType = roleToProType[req.user.role];
    const result = await pool.query(
      `SELECT * FROM service_request
       WHERE status='open' AND professional_type=$1
       ORDER BY id DESC`,
      [proType]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR OPEN FOR BARBER:", err);
    return res.status(500).json({ ok: false, error: "Error listando solicitudes abiertas" });
  }
};

// -------------------------------------------------------
// PROFESIONAL: Ver servicios activos asignados
// -------------------------------------------------------
exports.getAssignedForBarber = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const result = await pool.query(
      `SELECT * FROM service_request
       WHERE assigned_barber_id=$1 AND status IN ('accepted','on_route')
       ORDER BY id DESC`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR ASSIGNED BARBER:", err);
    return res.status(500).json({ ok: false, error: "Error listando servicios asignados" });
  }
};

// -------------------------------------------------------
// CLIENTE / PROFESIONAL: Ver solicitud por ID
// -------------------------------------------------------
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === "client") {
      const result = await pool.query(
        `SELECT * FROM service_request WHERE id=$1 AND client_id=$2 LIMIT 1`,
        [id, req.user.id]
      );
      if (result.rowCount === 0)
        return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
      return res.json({ ok: true, data: result.rows[0] });
    }
    // Profesional puede ver la solicitud asignada o cualquier abierta
    const result = await pool.query(
      `SELECT * FROM service_request WHERE id=$1 LIMIT 1`,
      [id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("ERROR GET BY ID:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitud" });
  }
};

// -------------------------------------------------------
// ACTUALIZAR ESTADO
// -------------------------------------------------------
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ["open", "accepted", "on_route", "completed", "cancelled"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: "Estado invalido" });
  }

  // Aceptar solicitud directamente (sin bid) — solo profesionales
  if (status === "accepted") {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales pueden aceptar solicitudes" });
    }
    const client = await pool.connect();
    let started = false;
    try {
      await client.query("BEGIN");
      started = true;
      const result = await client.query(
        `SELECT id, status FROM service_request WHERE id=$1 AND status='open' FOR UPDATE`,
        [id]
      );
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ ok: false, error: "Esta solicitud ya fue tomada" });
      }
      await client.query(
        `UPDATE service_request SET status='accepted', assigned_barber_id=$1 WHERE id=$2`,
        [req.user.id, id]
      );
      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (err) {
      if (started) await client.query("ROLLBACK").catch(() => {});
      console.error("ERROR ACCEPT REQUEST:", err);
      return res.status(500).json({ ok: false, error: "Error aceptando solicitud" });
    } finally {
      client.release();
    }
  }

  // Cualquier otro cambio de estado
  try {
    await pool.query(`UPDATE service_request SET status=$1 WHERE id=$2`, [status, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("ERROR UPDATE STATUS:", err);
    return res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
};
