const pool = require("../db/db");

exports.create = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }

    const { service_type, price, address, latitude, longitude } = req.body;

    if (!service_type || !price) {
      return res.status(400).json({
        ok: false,
        error: "service_type y price son obligatorios",
      });
    }

    const result = await pool.query(
      `INSERT INTO service_request
       (client_id, service_type, price, address, latitude, longitude, status)
       VALUES ($1,$2,$3,$4,$5,$6,'open')
       RETURNING *`,
      [
        req.user.id,
        service_type,
        Number(price),
        address || null,
        latitude ?? null,
        longitude ?? null,
      ]
    );

    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("🔥 ERROR CREATE SERVICE REQUEST:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Error creando solicitud de servicio" });
  }
};


exports.getMine = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }

    const result = await pool.query(
      `SELECT *
       FROM service_request
       WHERE client_id=$1
       ORDER BY id DESC`,
      [req.user.id]
    );

    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("🔥 ERROR GET MINE:", err);
    return res.status(500).json({ ok: false, error: "Error listando solicitudes" });
  }
};

exports.getById = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }

    const { id } = req.params;
    const result = await pool.query(
      `SELECT *
       FROM service_request
       WHERE id=$1 AND client_id=$2
       LIMIT 1`,
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }

    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("🔥 ERROR GET BY ID:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo solicitud" });
  }
};


exports.getOpenForBarber = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "barber") {
      return res.status(403).json({ ok: false, error: "Solo barberos" });
    }

    const result = await pool.query(
      `SELECT *
       FROM service_request
       WHERE status='open'
       ORDER BY id DESC`
    );

    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("🔥 ERROR OPEN FOR BARBER:", err);
    return res.status(500).json({ ok: false, error: "Error listando solicitudes abiertas" });
  }
};

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