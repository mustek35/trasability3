const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

(async () => {
  try {
    const { rows } = await pool.query('SELECT * FROM devices');
    console.log(rows);
  } catch (err) {
    console.error('Error querying devices:', err);
  } finally {
    await pool.end();
  }
})();