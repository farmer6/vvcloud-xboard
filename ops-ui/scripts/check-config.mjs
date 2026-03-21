import { getConfig } from "../lib/config.mjs";

const config = getConfig();
console.log(
  JSON.stringify(
    {
      ok: true,
      host: config.app.host,
      port: config.app.port,
      scope: config.scope,
      db: {
        host: config.db.host,
        port: config.db.port,
        name: config.db.name,
        user: config.db.user,
      },
    },
    null,
    2
  )
);
