const pool = require('./pool');

async function test() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('PostgreSQL conectado OK:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error conectando a PostgreSQL:', err.message);
    process.exit(1);
  }
}

test();