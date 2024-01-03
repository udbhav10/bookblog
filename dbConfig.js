import { config } from "dotenv";

import pg from "pg";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

const connectionString = 'postgresql://postgres:dalal123@localhost:5432/auth';

const pool = new Pool({
    connectionString: isProduction ? process.env.DATABASE_URL : connectionString
});

export { pool };