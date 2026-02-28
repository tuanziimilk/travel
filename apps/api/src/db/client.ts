import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../env";

const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: 10,
});

export const db = drizzle(pool);

