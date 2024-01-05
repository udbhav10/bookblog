import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DB,
    password: process.env.DB_PWD,
    port: 5432,
    ssl: {
        rejectUnauthorized: false, // This option is insecure and should only be used for testing purposes
    }
});

export { pool };



// import { config } from "dotenv";
// import pg from "pg";

// const { Pool } = pg;

// config(); // Load environment variables from .env file

// const isProduction = process.env.NODE_ENV === "production";

// const connectionString = process.env.CONNECTION_STRING;

// const pool = new Pool({
//     connectionString: isProduction ? process.env.DATABASE_URL : connectionString,
//     ssl: isProduction
//         ? {
//               rejectUnauthorized: false, // Set this to true in production with a valid SSL certificate
//           }
//         : false, // Only use SSL in production or when explicitly set in your environment
// });

// export { pool };