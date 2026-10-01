import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!sqlHost || !sqlDbName || !user || !password) {
  // Silent fail for build step if variables aren't present yet
  console.warn("SQL environment variables missing. Drizzle Kit may not work.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: sqlHost || "localhost",
    user: user || "postgres",
    password: password || "postgres",
    database: sqlDbName || "postgres",
    ssl: false,
  },
  verbose: true,
});
