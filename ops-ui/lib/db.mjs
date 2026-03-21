import mysql from "mysql2/promise";

import { getConfig } from "./config.mjs";

const { db } = getConfig();

export const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  database: db.name,
  user: db.user,
  password: db.pass,
  waitForConnections: true,
  connectionLimit: db.poolMax,
  maxIdle: db.poolMax,
  idleTimeout: 60000,
  queueLimit: 0,
  namedPlaceholders: true,
  multipleStatements: true,
});

export async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
