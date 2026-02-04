const db = require('../db/db');

async function findById(id) {
  const result = await db.query(
    'SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

module.exports = {
  findById
};