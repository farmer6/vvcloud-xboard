import fs from "node:fs";
import path from "node:path";

export function saveCache(cacheFile, payload) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(
    cacheFile,
    JSON.stringify(
      {
        version: 1,
        saved_at: new Date().toISOString(),
        ...payload,
      },
      null,
      2
    ),
    "utf8"
  );
}

export function loadCache(cacheFile) {
  if (!fs.existsSync(cacheFile)) {
    return null;
  }

  const raw = fs.readFileSync(cacheFile, "utf8");
  return JSON.parse(raw);
}
