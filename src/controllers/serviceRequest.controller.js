// src/controllers/serviceRequest.controller.js
const pool = require("../db/db");

const PROFESSIONAL_ROLES = ["barber", "estilista", "quiropodologo"];
const roleToProType = {
  barber: "profesional",
  estilista: "estilista",
  quiropodologo: "quiropodologo",
};

// Cliente: crear solicitud
exports.create = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes pueden crear solicitudes" });
    }
    const {
      service_type, address, latitude, longitude,
      price, professional_type, payment_method,
    } = req.body;

    if (!service_type || !address || !price) {
      return res.status(400).json({ ok: false, error: "Faltan campos obligatorios" });
    }

    const result = await pool.query(
      `INSERT INTO service_request
       (client_id, service_type, address, latitude, longitude, price, professional_type, payment_method, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')
       RETURNING *`,
      [
        req.user.id, service_type, address,
        latitude || null, longitude || null,
        price, professional_type || null,
        payment_method || null,
      ]
    );
    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("ERROR CREATE SERVICE REQUEST:", err);
    return res.status(500).json({ ok: false, error: "Error creando solicitud" });
  }
};

// Cliente: ver sus solicitudes activas
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
       ORDER BY sr.requested_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR GET MINE:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitudes" });
  }
};

// Profesional: ver solicitudes abiertas disponibles para su tipo
exports.getOpenForBarber = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const proType = roleToProType[req.user.role];
    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.latitude, sr.longitude, sr.status, sr.professional_type,
              sr.payment_method, sr.requested_at
       FROM service_request sr
       WHERE sr.status = 'open'
         AND sr.professional_type = $1
       ORDER BY sr.requested_at DESC
       LIMIT 50`,
      [proType]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR GET OPEN:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitudes" });
  }
};

// Profesional: ver sus servicios asignados activos (accepted o on_route)
// Permite recuperar el servicio si el profesional sale de la app
exports.getAssignedForBarber = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const result = await pool.query(
      `SELECT sr.id, sr.service_type, sr.address, sr.price,
              sr.status, sr.payment_method, sr.client_id,
              sr.latitude, sr.longitude, sr.requested_at,
              u.name as client_name, u.phone as client_phone
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.status IN ('accepted', 'on_route')
       ORDER BY sr.requested_at DESC
       LIMIT 5`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR GET ASSIGNED:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo servicios asignados" });
  }
};

// Ver una solicitud por ID
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

// Actualizar estado (cliente o profesional)
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const VALID = ["open", "accepted", "on_route", "completed", "cancelled"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ ok: false, error: "Estado invalido" });
    }
    const existing = await pool.query(`SELECT * FROM service_request WHERE id=$1`, [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }
    const sr = existing.rows[0];

    // Solo el cliente puede cancelar
    if (status === "cancelled" && sr.client_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: "Solo el cliente puede cancelar" });
    }
    // Solo el profesional asignado puede cambiar a on_route o completed
    if (["on_route", "completed"].includes(status) && sr.assigned_barber_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: "Solo el profesional asignado puede actualizar el estado" });
    }

    await pool.query(`UPDATE service_request SET status=$1 WHERE id=$2`, [status, id]);
    return res.json({ ok: true, status });
  } catch (err) {
    console.error("ERROR UPDATE STATUS:", err);
    return res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
};

// Profesional: historial de servicios completados y cancelados
// FIX: usar requested_at en lugar de sr.created_at (no existe esa columna)
exports.getHistoryForProfessional = async (req, res) => {
  try {
    if (!req.user || !PROFESSIONAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Solo profesionales" });
    }
    const result = await pool.query(
      `SELECT
         sr.id,
         sr.service_type,
         sr.address,
         sr.price,
         sr.payment_method,
         sr.status,
         sr.requested_at,
         u.name as client_name
       FROM service_request sr
       LEFT JOIN users u ON u.id = sr.client_id
       WHERE sr.assigned_barber_id = $1
         AND sr.status IN ('completed', 'cancelled')
       ORDER BY sr.requested_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("ERROR GET HISTORY:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo historial" });
  }
};
