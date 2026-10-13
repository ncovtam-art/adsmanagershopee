import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./database/schema";
export type AppDatabase = NodePgDatabase<typeof schema>;
export function connectDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,
    lock_timeout: 5000,
    application_name: "aacc",
  });
  pool.on("error", () => console.error("Kết nối Database bị gián đoạn."));
  return { db: drizzle(pool, { schema }), pool };
}
const globalDb = globalThis as unknown as {
  connection?: ReturnType<typeof connectDatabase>;
};
const connection =
  globalDb.connection ?? connectDatabase(process.env.DATABASE_URL ?? "");
if (process.env.NODE_ENV !== "production") globalDb.connection = connection;
export const { db, pool } = connection;
