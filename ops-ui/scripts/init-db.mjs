import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "../lib/db.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schema = fs.readFileSync(path.resolve(__dirname, "../schema.sql"), "utf8");

await pool.query(schema);
console.log("ops-ui schema initialized");
await pool.end();
