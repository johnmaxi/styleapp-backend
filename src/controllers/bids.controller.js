const pool = require("../db/db");

/**
 * BARBERO CREA CONTRAOFERTA
 *
 * CAMBIOS vs versión anterior:
 * - Se usa transacción con SELECT ... FOR UPDATE sobre service_request
 *   para garantizar que la solicitud sigue 'open' en el momento exacto
 *   de insertar la bid, evitando contraofertas sobre solicitudes ya tomadas.
 * - Si la solicitud fue tomada mientras el barbero escribía su oferta,
 *   retorna 409 Conflict con mensaje claro.
 */
exports.createBid = async (req, res) => {
  if (req.user.role !== "barber") {
    return res.status(403).json({ ok: false, error: "Solo barberos pueden ofertar" });
  }

  const { service_request_id, amount } = req.body;

  if (!service_request_id || !amount) {
    return res.status(400).json({ ok: false, error: "Datos incompletos" });
  }

  const client = await pool.connect();
  let started = false;

  try {
    await client.query("BEGIN");
    started = true;

    // Bloquea la fila de la solicitud mientras dura la transacción.
    // Garantiza que el status no cambie entre la lectura y la inserción.
    const requestResult = await client.query(
      `SELECT id, status FROM service_request
       WHERE id=$1 AND status='open'
       FOR UPDATE`,
      [service_request_id]
    );

    if (requestResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "Esta solicitud ya no está disponible para ofertar",
      });
    }

    // Evitar que el mismo barbero envíe una segunda oferta pendiente
    const existingPendingBid = await client.query(
      `SELECT id FROM bids
       WHERE service_request_id=$1
         AND barber_id=$2
         AND status='pending'`,
      [service_request_id, req.user.id]
    );

    if (existingPendingBid.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "Ya enviaste una oferta pendiente para esta solicitud",
      });
    }

    const newBid = await client.query(
      `INSERT INTO bids (service_request_id, barber_id, amount)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [service_request_id, req.user.id, amount]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, data: newBid.rows[0] });
  } catch (err) {
    if (started) await client.query("ROLLBACK").catch(() => {});
    console.error("🔥 ERROR CREATING BID:", err);
    return res.status(500).json({ ok: false, error: "Error creando oferta" });
  } finally {
    client.release();
  }
};

/**
 * CLIENTE VE CONTRAOFERTAS DE UNA SOLICITUD
 */
exports.getByRequest = async (req, res) => {
  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }

    const { id } = req.params;

    const request = await pool.query(
      `SELECT * FROM service_request WHERE id=$1 AND client_id=$2`,
      [id, req.user.id]
    );

    if (request.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
    }

    const result = await pool.query(
      `SELECT bids.id, bids.amount, bids.status, bids.created_at,
              users.id as barber_id, users.name
       FROM bids
       JOIN users ON users.id = bids.barber_id
       WHERE bids.service_request_id=$1
       ORDER BY bids.amount ASC`,
      [id]
    );

    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("🔥 ERROR GET BY REQUEST:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo ofertas" });
  }
};

/**
 * BARBERO VE SUS CONTRAOFERTAS EN UNA SOLICITUD
 */
exports.getByRequestForBarber = async (req, res) => {
  try {
    if (req.user.role !== "barber") {
      return res.status(403).json({ ok: false, error: "Solo barberos" });
    }

    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, service_request_id, barber_id, amount, status, created_at
       FROM bids
       WHERE service_request_id=$1 AND barber_id=$2
       ORDER BY id DESC`,
      [id, req.user.id]
    );

    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("🔥 ERROR GET BY REQUEST FOR BARBER:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo ofertas del barbero" });
  }
};

/**
 * CLIENTE ACEPTA UNA CONTRAOFERTA
 */
exports.acceptBid = async (req, res) => {
  const client = await pool.connect();
  let started = false;

  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }

    const { bidId } = req.params;

    const bidResult = await client.query(`SELECT * FROM bids WHERE id=$1`, [bidId]);

    if (bidResult.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Oferta no encontrada" });
    }

    const bid = bidResult.rows[0];

    const request = await client.query(
      `SELECT * FROM service_request WHERE id=$1 AND client_id=$2`,
      [bid.service_request_id, req.user.id]
    );

    if (request.rowCount === 0) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }

    await client.query("BEGIN");
    started = true;

    await client.query(`UPDATE bids SET status='accepted' WHERE id=$1`, [bidId]);

    await client.query(
      `UPDATE bids
       SET status='rejected'
       WHERE service_request_id=$1
         AND id<>$2`,
      [bid.service_request_id, bidId]
    );

    await client.query(
      `UPDATE service_request
       SET status='accepted', assigned_barber_id=$1
       WHERE id=$2`,
      [bid.barber_id, bid.service_request_id]
    );

    await client.query("COMMIT");

    return res.json({ ok: true });
  } catch (err) {
    if (started) await client.query("ROLLBACK").catch(() => {});
    console.error("🔥 ERROR ACCEPT BID:", err);
    return res.status(500).json({ ok: false, error: "Error aceptando oferta" });
  } finally {
    client.release();
  }
};

/**
 * CLIENTE RECHAZA UNA CONTRAOFERTA
 */
exports.rejectBid = async (req, res) => {
  const client = await pool.connect();
  let started = false;

  try {
    if (req.user.role !== "client") {
      return res.status(403).json({ ok: false, error: "Solo clientes" });
    }

    const { bidId } = req.params;

    const bidResult = await client.query(`SELECT * FROM bids WHERE id=$1`, [bidId]);

    if (bidResult.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Oferta no encontrada" });
    }

    const bid = bidResult.rows[0];

    const request = await client.query(
      `SELECT * FROM service_request WHERE id=$1 AND client_id=$2`,
      [bid.service_request_id, req.user.id]
    );

    if (request.rowCount === 0) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }

    if (["accepted", "on_route", "completed", "cancelled"].includes(request.rows[0].status)) {
      return res.status(400).json({ ok: false, error: "La solicitud ya no permite rechazar ofertas" });
    }

    if (bid.status !== "pending") {
      return res.status(400).json({ ok: false, error: "Solo puedes rechazar ofertas pendientes" });
    }

    await client.query("BEGIN");
    started = true;

    await client.query(`UPDATE bids SET status='rejected' WHERE id=$1`, [bidId]);

    await client.query(
      `UPDATE service_request
       SET status='open', assigned_barber_id=NULL
       WHERE id=$1`,
      [bid.service_request_id]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, message: "Oferta rechazada" });
  } catch (err) {
    if (started) await client.query("ROLLBACK").catch(() => {});
    console.error("🔥 ERROR REJECT BID:", err);
    return res.status(500).json({ ok: false, error: "Error rechazando oferta" });
  } finally {
    client.release();
  }
};
