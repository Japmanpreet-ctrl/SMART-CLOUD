import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../services/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const db = getDb();
  const schemaPath = path.resolve(__dirname, "../../../../packages/db/schema.sql");
  const sql = await readFile(schemaPath, "utf8");

  try {
    await db.query(sql);
    console.log("Database schema applied successfully.");
  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
