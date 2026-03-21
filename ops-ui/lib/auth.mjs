import { getConfig } from "./config.mjs";

const {
  app: { authUser, authPass },
} = getConfig();

function unauthorized(res) {
  res.setHeader("WWW-Authenticate", 'Basic realm="VVCloud Ops UI"');
  res.status(401).send("Authentication required");
}

export function requireBasicAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    unauthorized(res);
    return;
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const [user, pass] = decoded.split(":");
  if (user !== authUser || pass !== authPass) {
    unauthorized(res);
    return;
  }

  req.adminUser = user;
  next();
}
