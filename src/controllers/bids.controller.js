const pool = require("../db/pool");

exports.create = async (req, res) => {
  try {
    const barber_id = req.user.id; // 🔐 VIENE DEL TOKEN
    const { service_request_id, amount } = req.body;

    if (!service_request_id || !amount) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }

    const result = await pool.query(
      `INSERT INTO bids (service_request_id, barber_id, amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [service_request_id, barber_id, amount]
    );

    res.json({
      ok: true,
      message: "Oferta creada",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: "Error creando oferta" });
  }
};

exports.listByRequest = async (req, res) => {
  const { requestId } = req.params;

  const result = await pool.query(
    "SELECT * FROM bids WHERE service_request_id = $1",
    [requestId]
  );

  res.json({ ok: true, data: result.rows });
};