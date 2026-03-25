import "dotenv/config";
import mysql from "mysql2/promise";
import { env } from "../src/env";

async function main() {
  const pool = mysql.createPool({
    uri: env.databaseUrl,
    connectionLimit: 2,
    timezone: "+08:00",
  });

  try {
    const [result] = await pool.execute(
      `
        UPDATE skill_version_history
        SET change_note = ?
        WHERE action_type = 'bootstrap'
      `,
      ["初始化导入默认基线版本"],
    );

    const updated = "affectedRows" in (result as { affectedRows?: number }) ? Number((result as { affectedRows?: number }).affectedRows || 0) : 0;
    console.log(`[repair-bootstrap-skill-history-notes] updated=${updated}`);
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[repair-bootstrap-skill-history-notes] failed", error);
    process.exit(1);
  });
