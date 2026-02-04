const pool = require('../db/pool');

async function createBid({ job_request_id, barber_id, amount }) {
  const result = await pool.query(
    `INSERT INTO bids (service_request_id, barber_id, amount)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [job_request_id, barber_id, amount]
  );
  return result.rows[0];
}

async function getBidsByRequest(requestId) {
  const result = await pool.query(
    `SELECT * FROM bids WHERE service_request_id = $1`,
    [requestId]
  );
  return result.rows;
}

module.exports = {
  createBid,
  getBidsByRequest,
};