import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../env";

const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: 10,
  timezone: "+08:00",
});

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+08:00'");
});

export const db = drizzle(pool);
