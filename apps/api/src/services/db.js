import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

let pool;

async function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
      statement_timeout: config.databaseStatementTimeoutMs,
      query_timeout: config.databaseStatementTimeoutMs,
      idle_in_transaction_session_timeout: config.databaseStatementTimeoutMs,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }

  return pool;
}

export async function runDbPing() {
  const db = getDb();
  const startedAt = Date.now();

  try {
    const result = await withTimeout(
      db.query("select current_database() as db, current_user as usr, now() as server_time"),
      config.healthTimeoutMs,
      "database ping",
    );

    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      row: result.rows[0],
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}
