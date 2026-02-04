const pool = require('../db/pool');

exports.createRequest = async (req, res) => {
  try {
    const { client_id, service_type, address, latitude, longitude } = req.body;

    const result = await pool.query(
      `INSERT INTO service_request
       (client_id, service_type, address, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [client_id, service_type, address, latitude, longitude]
    );

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error creando service request' });
  }
};

exports.listRequests = async (req, res) => {
  const result = await pool.query('SELECT * FROM service_request ORDER BY id DESC');
  res.json({ ok: true, data: result.rows });
};