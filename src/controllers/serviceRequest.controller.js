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
    console.error("馃敟 ERROR CREATE SERVICE REQUEST:", err);
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
    console.error("馃敟 ERROR GET MINE:", err);
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
    console.error("馃敟 ERROR GET BY ID:", err);
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
    console.error("馃敟 ERROR OPEN FOR BARBER:", err);
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
    console.error("馃敟 ERROR ASSIGNED BARBER:", err);
    return res.status(500).json({ ok: false, error: "Error listando servicios asignados" });
  }
};

/**
 * BARBERO ACEPTA UNA SOLICITUD DIRECTAMENTE
 * Protecci贸n at贸mica con FOR UPDATE para evitar que dos barberos
 * acepten la misma solicitud simult谩neamente.
 *
 * CAMBIOS vs versi贸n anterior:
 * - Solo el rol 'barber' puede cambiar a 'accepted' por esta v铆a
 * - Se usa transacci贸n con SELECT ... FOR UPDATE para bloquear la fila
 * - Si la solicitud ya no est谩 'open', retorna 409 Conflict
 * - Los dem谩s cambios de estado (on_route, completed, cancelled) siguen
 *   siendo accesibles para el barbero asignado sin bloqueo especial
 */
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ["open", "accepted", "on_route", "completed", "cancelled"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ ok: false, error: "Estado inv谩lido" });
  }

  // 鈹€鈹€鈹€ Aceptar solicitud: flujo at贸mico exclusivo para barberos 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  if (status === "accepted") {
    if (!req.user || req.user.role !== "barber") {
      return res.status(403).json({ ok: false, error: "Solo barberos pueden aceptar solicitudes" });
    }

    const client = await pool.connect();
    let started = false;

    try {
      await client.query("BEGIN");
      started = true;

      // FOR UPDATE bloquea la fila hasta el COMMIT.
      // Si otro barbero ya ejecut贸 esto primero, este query esperar谩
      // y cuando lea encontrar谩 status != 'open', retornando 409.
      const result = await client.query(
        `SELECT id, status FROM service_request
         WHERE id=$1 AND status='open'
         FOR UPDATE`,
        [id]
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          error: "Esta solicitud ya fue tomada por otro barbero",
        });
      }

      await client.query(
        `UPDATE service_request
         SET status='accepted', assigned_barber_id=$1
         WHERE id=$2`,
        [req.user.id, id]
      );

      await client.query("COMMIT");

      return res.json({ ok: true });
    } catch (err) {
      if (started) await client.query("ROLLBACK").catch(() => {});
      console.error("馃敟 ERROR ACCEPT REQUEST:", err);
      return res.status(500).json({ ok: false, error: "Error aceptando solicitud" });
    } finally {
      client.release();
    }
  }

  // 鈹€鈹€鈹€ Otros cambios de estado (on_route, completed, cancelled, open) 鈹€鈹€鈹€鈹€鈹€
  try {
    await pool.query(
      `UPDATE service_request SET status=$1 WHERE id=$2`,
      [status, id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("馃敟 ERROR UPDATE STATUS:", err);
    return res.status(500).json({ ok: false, error: "Error actualizando estado" });
  }
};
