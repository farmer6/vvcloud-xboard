import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const healthEnabled = !["0", "false", "no", "off"].includes(
  String(process.env.HEALTH_ENABLED ?? "true").toLowerCase()
);
const healthHost = process.env.HEALTH_HOST?.trim() || "127.0.0.1";
const healthPort = Number.parseInt(process.env.HEALTH_PORT ?? "3939", 10);

if (!healthEnabled) {
  console.error("Health endpoint is disabled");
  process.exit(1);
}

try {
  const response = await fetch(`http://${healthHost}:${healthPort}/health`);
  if (!response.ok) {
    console.error(`Health check failed with status ${response.status}`);
    process.exit(1);
  }

  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
} catch (error) {
  console.error(
    `Unable to reach health endpoint at http://${healthHost}:${healthPort}/health`
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
