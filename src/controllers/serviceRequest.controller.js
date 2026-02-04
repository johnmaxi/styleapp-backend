const pool = require('../db'); // o tu conexión a postgres

exports.create = async (req, res) => {
  try {
    // 🔐 validación de rol
    if (!req.user || req.user.role !== 'client') {
      return res.status(401).json({ error: 'Solo clientes pueden crear solicitudes' });
    }

    const { service_type, address } = req.body;

    if (!service_type || !address) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const result = await pool.query(
      `INSERT INTO service_request (client_id, service_type, address, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [req.user.id, service_type, address]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creando solicitud' });
  }
};

exports.list = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM service_request ORDER BY requested_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error listando solicitudes' });
  }
};
