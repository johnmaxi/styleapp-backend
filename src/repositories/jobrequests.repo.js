const pool = require('../db/pool');

async function createJobRequest({ client_id, title, description }) {
  const result = await pool.query(
    `INSERT INTO service_request (client_id, service_type, address, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING *`,
    [client_id, title, description]
  );
  return result.rows[0];
}

async function getAllJobRequests() {
  const result = await pool.query(
    `SELECT * FROM service_request ORDER BY id DESC`
  );
  return result.rows;
}

module.exports = {
  createJobRequest,
  getAllJobRequests,
};