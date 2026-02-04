const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'styleapp_user',
  password: 'StyleAppPass123!',
  database: 'styleapp',
});

module.exports = pool;