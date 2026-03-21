import express from "express";

import { requireBasicAuth } from "./lib/auth.mjs";
import { getConfig } from "./lib/config.mjs";
import { query } from "./lib/db.mjs";
import { escape, page } from "./lib/render.mjs";

const { app: appConfig, scope } = getConfig();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(requireBasicAuth);

function getFlash(req) {
  return String(req.query.flash ?? "").trim();
}

function formatJson(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

function parseJsonTextarea(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  JSON.parse(trimmed);
  return trimmed;
}

function parseInteger(value, fallback = null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanField(value) {
  return value === "1" || value === "on" || value === "true";
}

function parseCsvList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function redirectWithFlash(res, targetPath, flash) {
  const suffix = targetPath.includes("?") ? "&" : "?";
  res.redirect(`${targetPath}${suffix}flash=${encodeURIComponent(flash)}`);
}

function optionList(items, valueKey, labelBuilder, selectedValue = null) {
  return items
    .map((item) => {
      const value = String(item[valueKey]);
      const selected = String(selectedValue ?? "") === value ? " selected" : "";
      return `<option value="${escape(value)}"${selected}>${escape(
        labelBuilder(item)
      )}</option>`;
    })
    .join("");
}

async function insertAuditLog({
  actorIdentifier,
  serviceId = null,
  action,
  targetTable,
  targetId = null,
  requestIp = null,
  beforeState = null,
  afterState = null,
}) {
  await query(
    `INSERT INTO ops_admin_audit_logs (
      actor_type, actor_identifier, service_id, action, target_table, target_id,
      request_ip, before_state_json, after_state_json
    ) VALUES (
      'admin_user', :actor_identifier, :service_id, :action, :target_table, :target_id,
      :request_ip, :before_state_json, :after_state_json
    )`,
    {
      actor_identifier: actorIdentifier,
      service_id: serviceId,
      action,
      target_table: targetTable,
      target_id: targetId,
      request_ip: requestIp,
      before_state_json: beforeState ? JSON.stringify(beforeState) : null,
      after_state_json: afterState ? JSON.stringify(afterState) : null,
    }
  );
}

async function getScopedService() {
  const rows = await query(
    `SELECT
       s.*,
       m.name AS module_name,
       m.code AS module_code,
       sys.name AS system_name,
       sys.code AS system_code
     FROM ops_services s
     INNER JOIN ops_modules m ON m.id = s.module_id
     INNER JOIN ops_systems sys ON sys.id = s.system_id
     WHERE sys.code = :system_code
       AND m.code = :module_code
       AND s.code = :service_code
       AND s.environment_code = :environment_code
     LIMIT 1`,
    {
      system_code: scope.system,
      module_code: scope.module,
      service_code: scope.service,
      environment_code: scope.environment,
    }
  );

  return rows[0] ?? null;
}

async function getSystems() {
  return query("SELECT * FROM ops_systems ORDER BY code ASC");
}

async function getModules() {
  return query(
    `SELECT m.*, s.code AS system_code, s.name AS system_name
     FROM ops_modules m
     INNER JOIN ops_systems s ON s.id = m.system_id
     ORDER BY s.code ASC, m.code ASC`
  );
}

async function getServices() {
  return query(
    `SELECT
       srv.*,
       sys.code AS system_code,
       sys.name AS system_name,
       mod.code AS module_code,
       mod.name AS module_name
     FROM ops_services srv
     INNER JOIN ops_systems sys ON sys.id = srv.system_id
     INNER JOIN ops_modules mod ON mod.id = srv.module_id
     ORDER BY sys.code ASC, mod.code ASC, srv.environment_code ASC, srv.code ASC`
  );
}

async function getModuleById(moduleId) {
  const rows = await query(
    "SELECT * FROM ops_modules WHERE id = :id LIMIT 1",
    { id: moduleId }
  );
  return rows[0] ?? null;
}

async function getServiceById(serviceId) {
  const rows = await query(
    "SELECT * FROM ops_services WHERE id = :id LIMIT 1",
    { id: serviceId }
  );
  return rows[0] ?? null;
}

async function assertOwnedEntity(tableName, id, serviceId) {
  if (id == null) {
    return;
  }

  const foreignKey =
    tableName === "ops_rule_sets" ? "service_id" : "service_id";
  const rows = await query(
    `SELECT id FROM ${tableName} WHERE id = :id AND ${foreignKey} = :service_id LIMIT 1`,
    { id, service_id: serviceId }
  );

  if (!rows[0]) {
    throw new Error(`${tableName} ${id} does not belong to service ${serviceId}`);
  }
}

async function getRuleSetById(ruleSetId) {
  const rows = await query(
    `SELECT
       rs.*,
       srv.code AS service_code,
       srv.environment_code,
       mod.code AS module_code,
       sys.code AS system_code
     FROM ops_rule_sets rs
     INNER JOIN ops_services srv ON srv.id = rs.service_id
     INNER JOIN ops_modules mod ON mod.id = srv.module_id
     INNER JOIN ops_systems sys ON sys.id = srv.system_id
     WHERE rs.id = :id
     LIMIT 1`,
    { id: ruleSetId }
  );
  return rows[0] ?? null;
}

async function getKnowledgeBaseById(knowledgeBaseId) {
  const rows = await query(
    `SELECT
       kb.*,
       srv.code AS service_code,
       srv.environment_code,
       mod.code AS module_code,
       sys.code AS system_code
     FROM ops_knowledge_bases kb
     INNER JOIN ops_services srv ON srv.id = kb.service_id
     INNER JOIN ops_modules mod ON mod.id = srv.module_id
     INNER JOIN ops_systems sys ON sys.id = srv.system_id
     WHERE kb.id = :id
     LIMIT 1`,
    { id: knowledgeBaseId }
  );
  return rows[0] ?? null;
}

app.get("/health", async (req, res) => {
  try {
    const rows = await query("SELECT 1 AS ok");
    res.json({
      ok: true,
      db: rows[0]?.ok === 1,
      scope,
      ts: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/", async (req, res) => {
  const [systemCount] = await query("SELECT COUNT(*) AS total FROM ops_systems");
  const [moduleCount] = await query("SELECT COUNT(*) AS total FROM ops_modules");
  const [serviceCount] = await query("SELECT COUNT(*) AS total FROM ops_services");
  const [matchCount] = await query(
    "SELECT COUNT(*) AS total FROM ops_match_logs WHERE created_at >= NOW() - INTERVAL 1 DAY"
  );

  const currentService = await getScopedService();

  res.send(
    page({
      currentPath: "/",
      title: "Unified Ops Dashboard",
      description: `当前默认作用域：${scope.system} / ${scope.module} / ${scope.service} / ${scope.environment}`,
      flash: getFlash(req),
      body: `
        <div class="grid cols-3">
          <section class="card">
            <div class="muted">Systems</div>
            <div class="stat-value">${escape(systemCount.total)}</div>
          </section>
          <section class="card">
            <div class="muted">Modules</div>
            <div class="stat-value">${escape(moduleCount.total)}</div>
          </section>
          <section class="card">
            <div class="muted">Services</div>
            <div class="stat-value">${escape(serviceCount.total)}</div>
          </section>
        </div>
        <div class="grid cols-3" style="margin-top:16px;">
          <section class="card">
            <div class="muted">Match Logs / 24h</div>
            <div class="stat-value">${escape(matchCount.total)}</div>
          </section>
          <section class="card">
            <div class="muted">Current Service</div>
            <div class="stat-value">${escape(currentService?.code ?? "unregistered")}</div>
          </section>
          <section class="card">
            <div class="muted">Environment</div>
            <div class="stat-value">${escape(scope.environment)}</div>
          </section>
        </div>
      `,
    })
  );
});

app.get("/systems", async (req, res) => {
  const systems = await getSystems();
  const rows = systems
    .map(
      (systemItem) => `
        <tr>
          <td>${escape(systemItem.id)}</td>
          <td>${escape(systemItem.code)}</td>
          <td>${escape(systemItem.name)}</td>
          <td>${escape(systemItem.status)}</td>
          <td>${escape(systemItem.owner_team ?? "-")}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/systems",
      title: "Systems",
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create System</h3>
          <form method="post" action="/systems" class="form-grid">
            <div class="row">
              <label>Code<input name="code" required placeholder="xboard"></label>
              <label>Name<input name="name" required placeholder="XBoard"></label>
            </div>
            <div class="row">
              <label>Status
                <select name="status">
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                  <option value="maintenance">maintenance</option>
                </select>
              </label>
              <label>Owner Team<input name="owner_team" placeholder="ops"></label>
            </div>
            <label>Description<textarea name="description" placeholder="System description"></textarea></label>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;region&quot;:&quot;ap-east-1&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create System</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/systems", async (req, res) => {
  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const result = await query(
    `INSERT INTO ops_systems (
      code, name, status, owner_team, description, metadata_json
    ) VALUES (
      :code, :name, :status, :owner_team, :description, :metadata_json
    )`,
    {
      code: String(req.body.code ?? "").trim(),
      name: String(req.body.name ?? "").trim(),
      status: String(req.body.status ?? "active").trim() || "active",
      owner_team: String(req.body.owner_team ?? "").trim() || null,
      description: String(req.body.description ?? "").trim() || null,
      metadata_json: metadataJson,
    }
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    action: "create_system",
    targetTable: "ops_systems",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      code: String(req.body.code ?? "").trim(),
      name: String(req.body.name ?? "").trim(),
    },
  });

  redirectWithFlash(res, "/systems", "System created");
});

app.get("/modules", async (req, res) => {
  const systems = await getSystems();
  const modules = await getModules();
  const rows = modules
    .map(
      (moduleItem) => `
        <tr>
          <td>${escape(moduleItem.id)}</td>
          <td>${escape(moduleItem.system_code)}</td>
          <td>${escape(moduleItem.code)}</td>
          <td>${escape(moduleItem.name)}</td>
          <td>${escape(moduleItem.module_type)}</td>
          <td>${escape(moduleItem.status)}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/modules",
      title: "Modules",
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create Module</h3>
          <form method="post" action="/modules" class="form-grid">
            <div class="row">
              <label>System
                <select name="system_id" required>
                  <option value="">Select a system</option>
                  ${optionList(systems, "id", (item) => `${item.code} · ${item.name}`)}
                </select>
              </label>
              <label>Code<input name="code" required placeholder="bot"></label>
            </div>
            <div class="row">
              <label>Name<input name="name" required placeholder="Bot"></label>
              <label>Module Type<input name="module_type" value="generic" placeholder="bot"></label>
            </div>
            <div class="row">
              <label>Status
                <select name="status">
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label>Description<input name="description" placeholder="Module description"></label>
            </div>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;group&quot;:&quot;messaging&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create Module</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>System</th>
                <th>Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/modules", async (req, res) => {
  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const result = await query(
    `INSERT INTO ops_modules (
      system_id, code, name, module_type, status, description, metadata_json
    ) VALUES (
      :system_id, :code, :name, :module_type, :status, :description, :metadata_json
    )`,
    {
      system_id: parseInteger(req.body.system_id),
      code: String(req.body.code ?? "").trim(),
      name: String(req.body.name ?? "").trim(),
      module_type: String(req.body.module_type ?? "generic").trim() || "generic",
      status: String(req.body.status ?? "active").trim() || "active",
      description: String(req.body.description ?? "").trim() || null,
      metadata_json: metadataJson,
    }
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    action: "create_module",
    targetTable: "ops_modules",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      system_id: parseInteger(req.body.system_id),
      code: String(req.body.code ?? "").trim(),
    },
  });

  redirectWithFlash(res, "/modules", "Module created");
});

app.get("/services", async (req, res) => {
  const systems = await getSystems();
  const modules = await getModules();
  const services = await getServices();
  const rows = services
    .map(
      (service) => `
        <tr>
          <td>${escape(service.id)}</td>
          <td><a href="/services/${service.id}">${escape(service.code)}</a></td>
          <td>${escape(service.system_code)}</td>
          <td>${escape(service.module_code)}</td>
          <td>${escape(service.environment_code)}</td>
          <td>${escape(service.service_type)}</td>
          <td>${escape(service.provider ?? "-")}</td>
          <td>${escape(service.status)}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/services",
      title: "Services",
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create Service</h3>
          <form method="post" action="/services" class="form-grid">
            <div class="row">
              <label>System
                <select name="system_id" required>
                  <option value="">Select a system</option>
                  ${optionList(systems, "id", (item) => `${item.code} · ${item.name}`)}
                </select>
              </label>
              <label>Module
                <select name="module_id" required>
                  <option value="">Select a module</option>
                  ${optionList(
                    modules,
                    "id",
                    (item) => `${item.system_code}/${item.code} · ${item.name}`
                  )}
                </select>
              </label>
            </div>
            <div class="row">
              <label>Service Code<input name="code" required placeholder="telegram_support"></label>
              <label>Service Name<input name="name" required placeholder="Telegram Support Bot"></label>
            </div>
            <div class="row">
              <label>Environment<input name="environment_code" value="production" placeholder="production"></label>
              <label>Service Type<input name="service_type" value="telegram_bot" placeholder="telegram_bot"></label>
            </div>
            <div class="row">
              <label>Provider<input name="provider" placeholder="telegram"></label>
              <label>Runtime Mode<input name="runtime_mode" placeholder="polling"></label>
            </div>
            <div class="row">
              <label>Deploy Type<input name="deploy_type" placeholder="systemd"></label>
              <label>Owner Team<input name="owner_team" placeholder="ops"></label>
            </div>
            <div class="row">
              <label>Status
                <select name="status">
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                  <option value="maintenance">maintenance</option>
                </select>
              </label>
              <label><span>Enabled</span><input type="checkbox" name="enabled" checked></label>
            </div>
            <label>Description<textarea name="description" placeholder="Service description"></textarea></label>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;bot_username&quot;:&quot;vvcloud_bot&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create Service</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>System</th>
                <th>Module</th>
                <th>Env</th>
                <th>Type</th>
                <th>Provider</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/services", async (req, res) => {
  const systemId = parseInteger(req.body.system_id);
  const moduleId = parseInteger(req.body.module_id);
  const moduleItem = await getModuleById(moduleId);

  if (!moduleItem) {
    throw new Error("Selected module does not exist");
  }

  if (moduleItem.system_id !== systemId) {
    throw new Error("Selected module does not belong to selected system");
  }

  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const result = await query(
    `INSERT INTO ops_services (
      system_id, module_id, environment_code, code, name, service_type,
      provider, runtime_mode, deploy_type, enabled, status, owner_team,
      description, metadata_json
    ) VALUES (
      :system_id, :module_id, :environment_code, :code, :name, :service_type,
      :provider, :runtime_mode, :deploy_type, :enabled, :status, :owner_team,
      :description, :metadata_json
    )`,
    {
      system_id: systemId,
      module_id: moduleId,
      environment_code:
        String(req.body.environment_code ?? "production").trim() || "production",
      code: String(req.body.code ?? "").trim(),
      name: String(req.body.name ?? "").trim(),
      service_type: String(req.body.service_type ?? "").trim(),
      provider: String(req.body.provider ?? "").trim() || null,
      runtime_mode: String(req.body.runtime_mode ?? "").trim() || null,
      deploy_type: String(req.body.deploy_type ?? "").trim() || null,
      enabled: parseBooleanField(req.body.enabled) ? 1 : 0,
      status: String(req.body.status ?? "active").trim() || "active",
      owner_team: String(req.body.owner_team ?? "").trim() || null,
      description: String(req.body.description ?? "").trim() || null,
      metadata_json: metadataJson,
    }
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    action: "create_service",
    targetTable: "ops_services",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      system_id: systemId,
      module_id: moduleId,
      code: String(req.body.code ?? "").trim(),
    },
  });

  redirectWithFlash(res, "/services", "Service created");
});

app.get("/services/:id", async (req, res) => {
  const [service] = await query(
    `SELECT
       srv.*,
       sys.code AS system_code,
       mod.code AS module_code
     FROM ops_services srv
     INNER JOIN ops_systems sys ON sys.id = srv.system_id
     INNER JOIN ops_modules mod ON mod.id = srv.module_id
     WHERE srv.id = :id
     LIMIT 1`,
    { id: req.params.id }
  );

  if (!service) {
    res.status(404).send("Service not found");
    return;
  }

  const [runtimeBinding] = await query(
    "SELECT * FROM ops_service_runtime_bindings WHERE service_id = :service_id LIMIT 1",
    { service_id: service.id }
  );

  const [instanceCount] = await query(
    "SELECT COUNT(*) AS total FROM ops_service_instances WHERE service_id = :service_id",
    { service_id: service.id }
  );

  const [endpointCount] = await query(
    "SELECT COUNT(*) AS total FROM ops_service_endpoints WHERE service_id = :service_id",
    { service_id: service.id }
  );

  const ruleSets = await query(
    `SELECT id, code, version_no, status
     FROM ops_rule_sets
     WHERE service_id = :service_id
     ORDER BY version_no DESC, id DESC`,
    { service_id: service.id }
  );

  const knowledgeBases = await query(
    `SELECT id, code, version_no, status
     FROM ops_knowledge_bases
     WHERE service_id = :service_id
     ORDER BY version_no DESC, id DESC`,
    { service_id: service.id }
  );

  const aiPolicies = await query(
    `SELECT id, provider, model, enabled
     FROM ops_ai_policies
     WHERE service_id = :service_id
     ORDER BY id DESC`,
    { service_id: service.id }
  );

  res.send(
    page({
      currentPath: "/services",
      title: `Service ${service.code}`,
      description: `${service.system_code} / ${service.module_code} / ${service.code} / ${service.environment_code}`,
      flash: getFlash(req),
      body: `
        <div class="grid cols-3">
          <section class="card">
            <div class="muted">Type</div>
            <div class="stat-value">${escape(service.service_type)}</div>
          </section>
          <section class="card">
            <div class="muted">Instances</div>
            <div class="stat-value">${escape(instanceCount.total)}</div>
          </section>
          <section class="card">
            <div class="muted">Endpoints</div>
            <div class="stat-value">${escape(endpointCount.total)}</div>
          </section>
        </div>
        <section class="card" style="margin-top:16px;">
          <table>
            <tbody>
              <tr><th>Name</th><td>${escape(service.name)}</td></tr>
              <tr><th>Provider</th><td>${escape(service.provider ?? "-")}</td></tr>
              <tr><th>Runtime Mode</th><td>${escape(service.runtime_mode ?? "-")}</td></tr>
              <tr><th>Deploy Type</th><td>${escape(service.deploy_type ?? "-")}</td></tr>
              <tr><th>Owner</th><td>${escape(service.owner_team ?? "-")}</td></tr>
              <tr><th>Config Version</th><td>${escape(service.config_version)}</td></tr>
              <tr><th>Active Rule Set</th><td>${escape(runtimeBinding?.active_rule_set_id ?? "-")}</td></tr>
              <tr><th>Active Knowledge Base</th><td>${escape(runtimeBinding?.active_knowledge_base_id ?? "-")}</td></tr>
              <tr><th>Active AI Policy</th><td>${escape(runtimeBinding?.active_ai_policy_id ?? "-")}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="card" style="margin-top:16px;">
          <h3 style="margin-top:0;">Runtime Binding</h3>
          <form method="post" action="/services/${service.id}/runtime-binding" class="form-grid">
            <div class="row">
              <label>Active Rule Set
                <select name="active_rule_set_id">
                  <option value="">None</option>
                  ${optionList(
                    ruleSets,
                    "id",
                    (item) => `${item.code} v${item.version_no} · ${item.status}`,
                    runtimeBinding?.active_rule_set_id ?? null
                  )}
                </select>
              </label>
              <label>Active Knowledge Base
                <select name="active_knowledge_base_id">
                  <option value="">None</option>
                  ${optionList(
                    knowledgeBases,
                    "id",
                    (item) => `${item.code} v${item.version_no} · ${item.status}`,
                    runtimeBinding?.active_knowledge_base_id ?? null
                  )}
                </select>
              </label>
            </div>
            <div class="row">
              <label>Active AI Policy
                <select name="active_ai_policy_id">
                  <option value="">None</option>
                  ${optionList(
                    aiPolicies,
                    "id",
                    (item) => `${item.provider}/${item.model}${item.enabled ? "" : " · disabled"}`,
                    runtimeBinding?.active_ai_policy_id ?? null
                  )}
                </select>
              </label>
              <label>Rollout Strategy
                <select name="rollout_strategy">
                  <option value="all"${
                    String(runtimeBinding?.rollout_strategy ?? "all") === "all"
                      ? " selected"
                      : ""
                  }>all</option>
                  <option value="canary"${
                    String(runtimeBinding?.rollout_strategy ?? "all") === "canary"
                      ? " selected"
                      : ""
                  }>canary</option>
                </select>
              </label>
            </div>
            <div class="actions"><button class="button primary" type="submit">Save Runtime Binding</button></div>
          </form>
        </section>
      `,
    })
  );
});

app.post("/services/:id/runtime-binding", async (req, res) => {
  const serviceId = parseInteger(req.params.id);
  const service = await getServiceById(serviceId);
  if (!service) {
    throw new Error("Service not found");
  }

  const activeRuleSetId = parseInteger(req.body.active_rule_set_id, null);
  const activeKnowledgeBaseId = parseInteger(req.body.active_knowledge_base_id, null);
  const activeAiPolicyId = parseInteger(req.body.active_ai_policy_id, null);

  await assertOwnedEntity("ops_rule_sets", activeRuleSetId, serviceId);
  await assertOwnedEntity("ops_knowledge_bases", activeKnowledgeBaseId, serviceId);
  if (activeAiPolicyId != null) {
    const aiRows = await query(
      "SELECT id FROM ops_ai_policies WHERE id = :id AND service_id = :service_id LIMIT 1",
      { id: activeAiPolicyId, service_id: serviceId }
    );
    if (!aiRows[0]) {
      throw new Error(`ops_ai_policies ${activeAiPolicyId} does not belong to service ${serviceId}`);
    }
  }

  const payload = {
    service_id: serviceId,
    active_rule_set_id: activeRuleSetId,
    active_knowledge_base_id: activeKnowledgeBaseId,
    active_ai_policy_id: activeAiPolicyId,
    rollout_strategy: String(req.body.rollout_strategy ?? "all").trim() || "all",
    updated_by: req.adminUser,
  };

  const beforeRows = await query(
    "SELECT * FROM ops_service_runtime_bindings WHERE service_id = :service_id LIMIT 1",
    { service_id: serviceId }
  );

  await query(
    `INSERT INTO ops_service_runtime_bindings (
      service_id, active_rule_set_id, active_knowledge_base_id,
      active_ai_policy_id, rollout_strategy, updated_by
    ) VALUES (
      :service_id, :active_rule_set_id, :active_knowledge_base_id,
      :active_ai_policy_id, :rollout_strategy, :updated_by
    )
    ON DUPLICATE KEY UPDATE
      active_rule_set_id = VALUES(active_rule_set_id),
      active_knowledge_base_id = VALUES(active_knowledge_base_id),
      active_ai_policy_id = VALUES(active_ai_policy_id),
      rollout_strategy = VALUES(rollout_strategy),
      updated_by = VALUES(updated_by)`,
    payload
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    serviceId,
    action: "update_runtime_binding",
    targetTable: "ops_service_runtime_bindings",
    targetId: serviceId,
    requestIp: req.ip,
    beforeState: beforeRows[0] ?? null,
    afterState: payload,
  });

  redirectWithFlash(res, `/services/${serviceId}`, "Runtime binding updated");
});

app.get("/rule-sets", async (req, res) => {
  const services = await getServices();
  const rows = await query(
    `SELECT
       rs.*,
       srv.code AS service_code,
       srv.environment_code
     FROM ops_rule_sets rs
     INNER JOIN ops_services srv ON srv.id = rs.service_id
     ORDER BY srv.code ASC, rs.code ASC, rs.version_no DESC`
  );

  const tableRows = rows
    .map(
      (item) => `
        <tr>
          <td>${escape(item.id)}</td>
          <td>${escape(item.service_code)}</td>
          <td><a href="/rule-sets/${item.id}">${escape(item.code)}</a></td>
          <td>${escape(item.version_no)}</td>
          <td>${escape(item.status)}</td>
          <td>${escape(item.environment_code)}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/rule-sets",
      title: "Rule Sets",
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create Rule Set</h3>
          <form method="post" action="/rule-sets" class="form-grid">
            <div class="row">
              <label>Service
                <select name="service_id" required>
                  <option value="">Select a service</option>
                  ${optionList(
                    services,
                    "id",
                    (item) =>
                      `${item.system_code}/${item.module_code}/${item.code}/${item.environment_code}`
                  )}
                </select>
              </label>
              <label>Code<input name="code" required placeholder="default"></label>
            </div>
            <div class="row">
              <label>Name<input name="name" required placeholder="Default Rules"></label>
              <label>Version No<input name="version_no" type="number" value="1" min="1"></label>
            </div>
            <div class="row">
              <label>Status
                <select name="status">
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label>Published By<input name="published_by" placeholder="${escape(req.adminUser)}"></label>
            </div>
            <label>Description<textarea name="description" placeholder="Rule set description"></textarea></label>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;source&quot;:&quot;manual&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create Rule Set</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Code</th>
                <th>Version</th>
                <th>Status</th>
                <th>Env</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/rule-sets", async (req, res) => {
  const serviceId = parseInteger(req.body.service_id);
  const service = await getServiceById(serviceId);
  if (!service) {
    throw new Error("Selected service does not exist");
  }

  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const status = String(req.body.status ?? "draft").trim() || "draft";
  const result = await query(
    `INSERT INTO ops_rule_sets (
      service_id, code, name, status, version_no,
      description, published_at, published_by, metadata_json
    ) VALUES (
      :service_id, :code, :name, :status, :version_no,
      :description, :published_at, :published_by, :metadata_json
    )`,
    {
      service_id: serviceId,
      code: String(req.body.code ?? "").trim(),
      name: String(req.body.name ?? "").trim(),
      status,
      version_no: parseInteger(req.body.version_no, 1),
      description: String(req.body.description ?? "").trim() || null,
      published_at: status === "published" ? new Date() : null,
      published_by: String(req.body.published_by ?? "").trim() || null,
      metadata_json: metadataJson,
    }
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    serviceId,
    action: "create_rule_set",
    targetTable: "ops_rule_sets",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      service_id: serviceId,
      code: String(req.body.code ?? "").trim(),
      version_no: parseInteger(req.body.version_no, 1),
    },
  });

  redirectWithFlash(res, "/rule-sets", "Rule set created");
});

app.get("/rule-sets/:id", async (req, res) => {
  const ruleSetId = parseInteger(req.params.id);
  const ruleSet = await getRuleSetById(ruleSetId);

  if (!ruleSet) {
    res.status(404).send("Rule set not found");
    return;
  }

  const rows = await query(
    `SELECT
       r.*,
       COUNT(rr.id) AS reply_count
     FROM ops_rules r
     LEFT JOIN ops_rule_replies rr ON rr.rule_id = r.id AND rr.enabled = 1
     WHERE r.rule_set_id = :rule_set_id
     GROUP BY r.id
     ORDER BY r.priority ASC, r.id ASC`,
    { rule_set_id: ruleSetId }
  );

  const tableRows = rows
    .map(
      (item) => `
        <tr>
          <td>${escape(item.id)}</td>
          <td>${escape(item.name)}</td>
          <td>${escape(item.confidence)}</td>
          <td>${escape(item.match_type)}</td>
          <td>${escape(item.priority)}</td>
          <td>${escape(item.reply_count)}</td>
          <td>${escape(item.enabled ? "enabled" : "disabled")}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/rule-sets",
      title: `Rule Set ${ruleSet.code}`,
      description: `${ruleSet.system_code} / ${ruleSet.module_code} / ${ruleSet.service_code} / ${ruleSet.environment_code}`,
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <table>
            <tbody>
              <tr><th>Name</th><td>${escape(ruleSet.name)}</td></tr>
              <tr><th>Status</th><td>${escape(ruleSet.status)}</td></tr>
              <tr><th>Version</th><td>${escape(ruleSet.version_no)}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create Rule</h3>
          <form method="post" action="/rule-sets/${ruleSet.id}/rules" class="form-grid">
            <div class="row">
              <label>Name<input name="name" required placeholder="download-client"></label>
              <label>Description<input name="description" placeholder="Client download guidance"></label>
            </div>
            <div class="row">
              <label>Confidence
                <select name="confidence">
                  <option value="high">high</option>
                  <option value="low">low</option>
                </select>
              </label>
              <label>Match Type
                <select name="match_type">
                  <option value="includes">includes</option>
                  <option value="exact">exact</option>
                  <option value="word">word</option>
                  <option value="regex">regex</option>
                </select>
              </label>
            </div>
            <div class="row">
              <label>Pattern
                <input name="pattern" placeholder="验证码|收不到邮件">
              </label>
              <label>Keywords
                <input name="keywords" placeholder="下载, 客户端">
              </label>
            </div>
            <div class="row">
              <label>Exclude Keywords
                <input name="exclude_keywords" placeholder="下载速度">
              </label>
              <label>Regex Flags
                <input name="regex_flags" placeholder="i">
              </label>
            </div>
            <div class="row">
              <label>Cooldown Seconds<input name="cooldown_seconds" type="number" min="0" value="90"></label>
              <label>Priority<input name="priority" type="number" value="100"></label>
            </div>
            <div class="row">
              <label><span>Enabled</span><input type="checkbox" name="enabled" checked></label>
              <label><span>Stop On Match</span><input type="checkbox" name="stop_on_match" checked></label>
            </div>
            <label>Reply Templates<textarea name="replies" required placeholder="每行一个回复模板"></textarea></label>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;channel&quot;:&quot;telegram&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create Rule</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Confidence</th>
                <th>Match</th>
                <th>Priority</th>
                <th>Replies</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/rule-sets/:id/rules", async (req, res) => {
  const ruleSetId = parseInteger(req.params.id);
  const ruleSet = await getRuleSetById(ruleSetId);

  if (!ruleSet) {
    throw new Error("Rule set not found");
  }

  const matchType = String(req.body.match_type ?? "includes").trim() || "includes";
  const keywords = parseCsvList(req.body.keywords);
  const excludeKeywords = parseCsvList(req.body.exclude_keywords);
  const replies = String(req.body.replies ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (matchType === "regex" && !String(req.body.pattern ?? "").trim()) {
    throw new Error("Regex rules require pattern");
  }

  if (matchType !== "regex" && keywords.length === 0) {
    throw new Error("Non-regex rules require at least one keyword");
  }

  if (replies.length === 0) {
    throw new Error("At least one reply template is required");
  }

  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const result = await query(
    `INSERT INTO ops_rules (
      rule_set_id, name, description, enabled, confidence, match_type,
      pattern, keywords_json, exclude_keywords_json, regex_flags,
      cooldown_seconds, priority, stop_on_match, metadata_json
    ) VALUES (
      :rule_set_id, :name, :description, :enabled, :confidence, :match_type,
      :pattern, :keywords_json, :exclude_keywords_json, :regex_flags,
      :cooldown_seconds, :priority, :stop_on_match, :metadata_json
    )`,
    {
      rule_set_id: ruleSetId,
      name: String(req.body.name ?? "").trim(),
      description: String(req.body.description ?? "").trim() || null,
      enabled: parseBooleanField(req.body.enabled) ? 1 : 0,
      confidence: String(req.body.confidence ?? "high").trim() || "high",
      match_type: matchType,
      pattern: String(req.body.pattern ?? "").trim() || null,
      keywords_json: keywords.length > 0 ? JSON.stringify(keywords) : null,
      exclude_keywords_json:
        excludeKeywords.length > 0 ? JSON.stringify(excludeKeywords) : null,
      regex_flags: String(req.body.regex_flags ?? "").trim() || null,
      cooldown_seconds: parseInteger(req.body.cooldown_seconds, null),
      priority: parseInteger(req.body.priority, 100),
      stop_on_match: parseBooleanField(req.body.stop_on_match) ? 1 : 0,
      metadata_json: metadataJson,
    }
  );

  for (const [index, replyText] of replies.entries()) {
    await query(
      `INSERT INTO ops_rule_replies (
        rule_id, reply_text, sort_order, enabled
      ) VALUES (
        :rule_id, :reply_text, :sort_order, 1
      )`,
      {
        rule_id: result.insertId,
        reply_text: replyText,
        sort_order: index,
      }
    );
  }

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    serviceId: ruleSet.service_id,
    action: "create_rule",
    targetTable: "ops_rules",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      rule_set_id: ruleSetId,
      name: String(req.body.name ?? "").trim(),
      reply_count: replies.length,
    },
  });

  redirectWithFlash(res, `/rule-sets/${ruleSetId}`, "Rule created");
});

app.get("/knowledge-bases", async (req, res) => {
  const services = await getServices();
  const rows = await query(
    `SELECT
       kb.*,
       srv.code AS service_code,
       srv.environment_code
     FROM ops_knowledge_bases kb
     INNER JOIN ops_services srv ON srv.id = kb.service_id
     ORDER BY srv.code ASC, kb.code ASC, kb.version_no DESC`
  );

  const tableRows = rows
    .map(
      (item) => `
        <tr>
          <td>${escape(item.id)}</td>
          <td>${escape(item.service_code)}</td>
          <td><a href="/knowledge-bases/${item.id}">${escape(item.code)}</a></td>
          <td>${escape(item.version_no)}</td>
          <td>${escape(item.status)}</td>
          <td>${escape(item.environment_code)}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/knowledge-bases",
      title: "Knowledge Bases",
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create Knowledge Base</h3>
          <form method="post" action="/knowledge-bases" class="form-grid">
            <div class="row">
              <label>Service
                <select name="service_id" required>
                  <option value="">Select a service</option>
                  ${optionList(
                    services,
                    "id",
                    (item) =>
                      `${item.system_code}/${item.module_code}/${item.code}/${item.environment_code}`
                  )}
                </select>
              </label>
              <label>Code<input name="code" required placeholder="default"></label>
            </div>
            <div class="row">
              <label>Name<input name="name" required placeholder="Default Knowledge Base"></label>
              <label>Version No<input name="version_no" type="number" value="1" min="1"></label>
            </div>
            <div class="row">
              <label>Status
                <select name="status">
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label>Published By<input name="published_by" placeholder="${escape(req.adminUser)}"></label>
            </div>
            <label>Description<textarea name="description" placeholder="Knowledge base description"></textarea></label>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;source&quot;:&quot;manual&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create Knowledge Base</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Code</th>
                <th>Version</th>
                <th>Status</th>
                <th>Env</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/knowledge-bases", async (req, res) => {
  const serviceId = parseInteger(req.body.service_id);
  const service = await getServiceById(serviceId);
  if (!service) {
    throw new Error("Selected service does not exist");
  }

  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const status = String(req.body.status ?? "draft").trim() || "draft";
  const result = await query(
    `INSERT INTO ops_knowledge_bases (
      service_id, code, name, status, version_no,
      description, published_at, published_by, metadata_json
    ) VALUES (
      :service_id, :code, :name, :status, :version_no,
      :description, :published_at, :published_by, :metadata_json
    )`,
    {
      service_id: serviceId,
      code: String(req.body.code ?? "").trim(),
      name: String(req.body.name ?? "").trim(),
      status,
      version_no: parseInteger(req.body.version_no, 1),
      description: String(req.body.description ?? "").trim() || null,
      published_at: status === "published" ? new Date() : null,
      published_by: String(req.body.published_by ?? "").trim() || null,
      metadata_json: metadataJson,
    }
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    serviceId,
    action: "create_knowledge_base",
    targetTable: "ops_knowledge_bases",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      service_id: serviceId,
      code: String(req.body.code ?? "").trim(),
      version_no: parseInteger(req.body.version_no, 1),
    },
  });

  redirectWithFlash(res, "/knowledge-bases", "Knowledge base created");
});

app.get("/knowledge-bases/:id", async (req, res) => {
  const knowledgeBaseId = parseInteger(req.params.id);
  const knowledgeBase = await getKnowledgeBaseById(knowledgeBaseId);

  if (!knowledgeBase) {
    res.status(404).send("Knowledge base not found");
    return;
  }

  const rows = await query(
    `SELECT *
     FROM ops_knowledge_items
     WHERE knowledge_base_id = :knowledge_base_id
     ORDER BY priority ASC, id ASC`,
    { knowledge_base_id: knowledgeBaseId }
  );

  const tableRows = rows
    .map(
      (item) => `
        <tr>
          <td>${escape(item.id)}</td>
          <td>${escape(item.title)}</td>
          <td>${escape(item.category ?? "-")}</td>
          <td>${escape(item.priority)}</td>
          <td>${escape(item.enabled ? "enabled" : "disabled")}</td>
          <td class="mono">${escape(item.response_text ?? item.summary ?? "")}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/knowledge-bases",
      title: `Knowledge Base ${knowledgeBase.code}`,
      description: `${knowledgeBase.system_code} / ${knowledgeBase.module_code} / ${knowledgeBase.service_code} / ${knowledgeBase.environment_code}`,
      flash: getFlash(req),
      body: `
        <section class="card" style="margin-bottom:16px;">
          <table>
            <tbody>
              <tr><th>Name</th><td>${escape(knowledgeBase.name)}</td></tr>
              <tr><th>Status</th><td>${escape(knowledgeBase.status)}</td></tr>
              <tr><th>Version</th><td>${escape(knowledgeBase.version_no)}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="card" style="margin-bottom:16px;">
          <h3 style="margin-top:0;">Create Knowledge Item</h3>
          <form method="post" action="/knowledge-bases/${knowledgeBase.id}/items" class="form-grid">
            <div class="row">
              <label>Title<input name="title" required placeholder="验证码收不到"></label>
              <label>Category<input name="category" placeholder="mail"></label>
            </div>
            <div class="row">
              <label>Priority<input name="priority" type="number" value="100"></label>
              <label><span>Enabled</span><input type="checkbox" name="enabled" checked></label>
            </div>
            <label>Keywords<input name="keywords" placeholder="验证码, 收不到邮件, 邮箱"></label>
            <label>Summary<textarea name="summary" placeholder="短摘要"></textarea></label>
            <label>Response Text<textarea name="response_text" placeholder="Bot 优先回复文本"></textarea></label>
            <label>Content Markdown<textarea name="content_markdown" required placeholder="完整知识内容，支持 Markdown"></textarea></label>
            <label>Metadata JSON<textarea name="metadata_json" placeholder="{&quot;source&quot;:&quot;faq&quot;}"></textarea></label>
            <div class="actions"><button class="button primary" type="submit">Create Knowledge Item</button></div>
          </form>
        </section>
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Response</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.post("/knowledge-bases/:id/items", async (req, res) => {
  const knowledgeBaseId = parseInteger(req.params.id);
  const knowledgeBase = await getKnowledgeBaseById(knowledgeBaseId);

  if (!knowledgeBase) {
    throw new Error("Knowledge base not found");
  }

  const keywords = parseCsvList(req.body.keywords);
  const metadataJson = parseJsonTextarea(req.body.metadata_json);
  const result = await query(
    `INSERT INTO ops_knowledge_items (
      knowledge_base_id, title, category, enabled, priority,
      keywords_json, summary, response_text, content_markdown, metadata_json
    ) VALUES (
      :knowledge_base_id, :title, :category, :enabled, :priority,
      :keywords_json, :summary, :response_text, :content_markdown, :metadata_json
    )`,
    {
      knowledge_base_id: knowledgeBaseId,
      title: String(req.body.title ?? "").trim(),
      category: String(req.body.category ?? "").trim() || null,
      enabled: parseBooleanField(req.body.enabled) ? 1 : 0,
      priority: parseInteger(req.body.priority, 100),
      keywords_json: keywords.length > 0 ? JSON.stringify(keywords) : null,
      summary: String(req.body.summary ?? "").trim() || null,
      response_text: String(req.body.response_text ?? "").trim() || null,
      content_markdown: String(req.body.content_markdown ?? "").trim(),
      metadata_json: metadataJson,
    }
  );

  await insertAuditLog({
    actorIdentifier: req.adminUser,
    serviceId: knowledgeBase.service_id,
    action: "create_knowledge_item",
    targetTable: "ops_knowledge_items",
    targetId: result.insertId,
    requestIp: req.ip,
    afterState: {
      knowledge_base_id: knowledgeBaseId,
      title: String(req.body.title ?? "").trim(),
      keyword_count: keywords.length,
    },
  });

  redirectWithFlash(res, `/knowledge-bases/${knowledgeBaseId}`, "Knowledge item created");
});

app.get("/logs/matches", async (req, res) => {
  const logs = await query(
    `SELECT
       ml.*,
       srv.code AS service_code
     FROM ops_match_logs ml
     INNER JOIN ops_services srv ON srv.id = ml.service_id
     ORDER BY ml.id DESC
     LIMIT 100`
  );

  const rows = logs
    .map(
      (logItem) => `
        <tr>
          <td>${escape(logItem.id)}</td>
          <td>${escape(logItem.service_code)}</td>
          <td>${escape(logItem.source_kind)}</td>
          <td>${escape(logItem.status)}</td>
          <td>${escape(logItem.created_at)}</td>
          <td class="mono">${escape(logItem.message_excerpt ?? "")}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/logs/matches",
      title: "Match Logs",
      flash: getFlash(req),
      body: `
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Source</th>
                <th>Status</th>
                <th>Created</th>
                <th>Excerpt</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.get("/logs/errors", async (req, res) => {
  const logs = await query(
    `SELECT
       el.*,
       srv.code AS service_code
     FROM ops_error_logs el
     INNER JOIN ops_services srv ON srv.id = el.service_id
     ORDER BY el.id DESC
     LIMIT 100`
  );

  const rows = logs
    .map(
      (logItem) => `
        <tr>
          <td>${escape(logItem.id)}</td>
          <td>${escape(logItem.service_code)}</td>
          <td>${escape(logItem.source)}</td>
          <td>${escape(logItem.error_level)}</td>
          <td>${escape(logItem.created_at)}</td>
          <td class="mono">${escape(logItem.error_message)}</td>
        </tr>
      `
    )
    .join("");

  res.send(
    page({
      currentPath: "/logs/errors",
      title: "Error Logs",
      flash: getFlash(req),
      body: `
        <section class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Source</th>
                <th>Level</th>
                <th>Created</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `,
    })
  );
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send(
    page({
      currentPath: "/",
      title: "Ops UI Error",
      description: "Request failed",
      flash: error instanceof Error ? error.message : String(error),
      body: `
        <section class="card">
          <div class="mono">${escape(error?.stack ?? String(error))}</div>
        </section>
      `,
    })
  );
});

app.listen(appConfig.port, appConfig.host, () => {
  console.log(
    `VVCloud Ops UI listening at http://${appConfig.host}:${appConfig.port} for ${scope.system}/${scope.module}/${scope.service}/${scope.environment}`
  );
});
