import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      user: process.env.PGUSER || "teraterapostgres",
      host: process.env.PGHOST || "104.214.173.123",
      database: process.env.PGDATABASE || "terahumi",
      password: process.env.PGPASSWORD || "T3r4huM1",
      port: Number(process.env.PGPORT || 5437),
    });

async function main() {
  try {
    console.log("Connecting to database...");
    const health = await pool.query("SELECT 1 as ok");
    console.log("Database connection successful:", health.rows);

    console.log("Checking if table 'users' exists...");
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      );
    `);
    console.log("Table 'users' exists:", tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      console.log("Listing all columns in 'users' table:");
      const columns = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users';
      `);
      console.log(columns.rows);

      console.log("Listing users in the 'users' table (without password hashes):");
      const users = await pool.query("SELECT id, username, role, created_at FROM users");
      console.log(users.rows);
    }
  } catch (err) {
    console.error("Database check failed:", err);
  } finally {
    await pool.end();
  }
}

main();
