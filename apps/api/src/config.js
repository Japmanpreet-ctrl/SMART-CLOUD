import dotenv from "dotenv";

dotenv.config({ path: "../../.env.local" });
dotenv.config({ path: "../../.env" });
dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  apiPort: Number(process.env.API_PORT || 4000),
  apiHost: process.env.API_HOST || "127.0.0.1",
  databaseUrl: required("DATABASE_URL"),
  databaseConnectionTimeoutMs: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
  databaseStatementTimeoutMs: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 10000),
  healthTimeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || 12000),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseStorageBucket: required("SUPABASE_STORAGE_BUCKET"),
  firebaseProjectId: required("FIREBASE_PROJECT_ID"),
  firebaseClientEmail: required("FIREBASE_CLIENT_EMAIL"),
  firebasePrivateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  aiServiceUrl:
    process.env.AI_SERVICE_URL ||
    `http://127.0.0.1:${Number(process.env.AI_SERVICE_PORT || 8000)}`,
  faceClusterThreshold: Number(process.env.FACE_CLUSTER_THRESHOLD || 0.68),
};
