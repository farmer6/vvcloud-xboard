import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig() {
  return {
    app: {
      host: process.env.OPS_UI_HOST?.trim() || "127.0.0.1",
      port: parseNumber(process.env.OPS_UI_PORT, 4040),
      authUser: getRequiredEnv("OPS_UI_BASIC_AUTH_USER"),
      authPass: getRequiredEnv("OPS_UI_BASIC_AUTH_PASS"),
    },
    scope: {
      system: getRequiredEnv("OPS_SCOPE_SYSTEM"),
      module: getRequiredEnv("OPS_SCOPE_MODULE"),
      service: getRequiredEnv("OPS_SCOPE_SERVICE"),
      environment: process.env.OPS_SCOPE_ENV?.trim() || "production",
    },
    db: {
      host: getRequiredEnv("OPS_DB_HOST"),
      port: parseNumber(process.env.OPS_DB_PORT, 3306),
      name: getRequiredEnv("OPS_DB_NAME"),
      user: getRequiredEnv("OPS_DB_USER"),
      pass: process.env.OPS_DB_PASS ?? "",
      poolMin: parseNumber(process.env.OPS_DB_POOL_MIN, 1),
      poolMax: parseNumber(process.env.OPS_DB_POOL_MAX, 10),
    },
  };
}
