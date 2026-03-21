import mysql from "mysql2/promise";

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function groupRuleRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: `ops_rule:${row.id}`,
        externalId: row.id,
        type: row.match_type,
        confidence: row.confidence,
        priority: row.priority,
        pattern: row.pattern,
        keywords: parseJsonArray(row.keywords_json),
        excludeKeywords: parseJsonArray(row.exclude_keywords_json),
        flags: row.regex_flags,
        cooldownSeconds: row.cooldown_seconds,
        replies: [],
      });
    }

    if (row.reply_text) {
      grouped.get(row.id).replies.push(String(row.reply_text).trim());
    }
  }

  return [...grouped.values()].map((rule) => ({
    ...rule,
    replies: rule.replies.filter(Boolean),
  }));
}

function mapKnowledgeRows(rows) {
  return rows.map((row) => ({
    id: `ops_knowledge:${row.id}`,
    externalId: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    keywords: parseJsonArray(row.keywords_json),
    responseText: row.response_text || row.summary || "",
    summary: row.summary || "",
    content: row.content_markdown || "",
  }));
}

export function createOpsStore(config) {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.pass,
    waitForConnections: true,
    connectionLimit: config.db.poolMax,
    maxIdle: config.db.poolMax,
    idleTimeout: 60000,
    queueLimit: 0,
    namedPlaceholders: true,
  });

  const scopeParams = {
    system_code: config.scope.system,
    module_code: config.scope.module,
    service_code: config.scope.service,
    environment_code: config.scope.environment,
  };

  let resolvedService = null;

  async function execute(sql, params = {}) {
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  async function resolveService() {
    if (resolvedService) {
      return resolvedService;
    }

    const rows = await execute(
      `SELECT
         srv.id,
         srv.code,
         srv.name,
         srv.environment_code,
         srv.service_type,
         mod.code AS module_code,
         sys.code AS system_code
       FROM ops_services srv
       INNER JOIN ops_modules mod ON mod.id = srv.module_id
       INNER JOIN ops_systems sys ON sys.id = srv.system_id
       WHERE sys.code = :system_code
         AND mod.code = :module_code
         AND srv.code = :service_code
         AND srv.environment_code = :environment_code
         AND srv.enabled = 1
       LIMIT 1`,
      scopeParams
    );

    const service = rows[0];
    if (!service) {
      throw new Error(
        `Ops service not found for ${scopeParams.system_code}/${scopeParams.module_code}/${scopeParams.service_code}/${scopeParams.environment_code}`
      );
    }

    resolvedService = service;
    return service;
  }

  async function resolveRuntimeBinding(serviceId) {
    const rows = await execute(
      `SELECT
         active_rule_set_id,
         active_knowledge_base_id,
         active_ai_policy_id
       FROM ops_service_runtime_bindings
       WHERE service_id = :service_id
       LIMIT 1`,
      { service_id: serviceId }
    );

    return (
      rows[0] ?? {
        active_rule_set_id: null,
        active_knowledge_base_id: null,
        active_ai_policy_id: null,
      }
    );
  }

  async function resolveActiveRuleSetId(serviceId, runtimeBinding) {
    if (runtimeBinding.active_rule_set_id) {
      return runtimeBinding.active_rule_set_id;
    }

    const rows = await execute(
      `SELECT id
       FROM ops_rule_sets
       WHERE service_id = :service_id
         AND status = 'published'
       ORDER BY version_no DESC, id DESC
       LIMIT 1`,
      { service_id: serviceId }
    );

    return rows[0]?.id ?? null;
  }

  async function resolveActiveKnowledgeBaseId(serviceId, runtimeBinding) {
    if (runtimeBinding.active_knowledge_base_id) {
      return runtimeBinding.active_knowledge_base_id;
    }

    const rows = await execute(
      `SELECT id
       FROM ops_knowledge_bases
       WHERE service_id = :service_id
         AND status = 'published'
       ORDER BY version_no DESC, id DESC
       LIMIT 1`,
      { service_id: serviceId }
    );

    return rows[0]?.id ?? null;
  }

  async function loadBotData() {
    const service = await resolveService();
    const runtimeBinding = await resolveRuntimeBinding(service.id);
    const activeRuleSetId = await resolveActiveRuleSetId(service.id, runtimeBinding);
    const activeKnowledgeBaseId = await resolveActiveKnowledgeBaseId(
      service.id,
      runtimeBinding
    );

    const ruleRows =
      activeRuleSetId == null
        ? []
        : await execute(
            `SELECT
               r.*,
               rr.reply_text,
               rr.sort_order
             FROM ops_rules r
             LEFT JOIN ops_rule_replies rr
               ON rr.rule_id = r.id
              AND rr.enabled = 1
             WHERE r.rule_set_id = :rule_set_id
               AND r.enabled = 1
             ORDER BY r.priority ASC, r.id ASC, rr.sort_order ASC, rr.id ASC`,
            { rule_set_id: activeRuleSetId }
          );

    const knowledgeRows =
      activeKnowledgeBaseId == null
        ? []
        : await execute(
            `SELECT *
             FROM ops_knowledge_items
             WHERE knowledge_base_id = :knowledge_base_id
               AND enabled = 1
             ORDER BY priority ASC, id ASC`,
            { knowledge_base_id: activeKnowledgeBaseId }
          );

    return {
      service,
      runtimeBinding,
      rules: groupRuleRows(ruleRows),
      knowledgeItems: mapKnowledgeRows(knowledgeRows),
    };
  }

  async function insertMatchLog(entry) {
    const service = await resolveService();
    await execute(
      `INSERT INTO ops_match_logs (
        service_id, instance_id, source_kind, source_id,
        chat_id, message_id, from_id, confidence, status,
        message_excerpt, reply_preview, extra_context_json
      ) VALUES (
        :service_id, :instance_id, :source_kind, :source_id,
        :chat_id, :message_id, :from_id, :confidence, :status,
        :message_excerpt, :reply_preview, :extra_context_json
      )`,
      {
        service_id: service.id,
        instance_id: entry.instance_id ?? null,
        source_kind: entry.source_kind,
        source_id:
          entry.source_id ??
          (entry.source_kind === "rule"
            ? (entry.rule_id ?? null)
            : (entry.knowledge_item_id ?? null)),
        chat_id: entry.chat_id ?? null,
        message_id: entry.message_id ?? null,
        from_id: entry.from_id ?? null,
        confidence: entry.confidence ?? null,
        status: entry.status,
        message_excerpt: entry.message_excerpt ?? null,
        reply_preview: entry.reply_preview ?? null,
        extra_context_json: entry.extra_context
          ? JSON.stringify(entry.extra_context)
          : null,
      }
    );
  }

  async function insertErrorLog(entry) {
    const service = await resolveService();
    await execute(
      `INSERT INTO ops_error_logs (
        service_id, instance_id, source, error_level, error_code,
        error_message, chat_id, message_id, error_context_json, trace_excerpt
      ) VALUES (
        :service_id, :instance_id, :source, :error_level, :error_code,
        :error_message, :chat_id, :message_id, :error_context_json, :trace_excerpt
      )`,
      {
        service_id: service.id,
        instance_id: entry.instance_id ?? null,
        source: entry.source,
        error_level: entry.error_level ?? "error",
        error_code: entry.error_code ?? null,
        error_message: entry.error_message,
        chat_id: entry.chat_id ?? null,
        message_id: entry.message_id ?? null,
        error_context_json: entry.error_context
          ? JSON.stringify(entry.error_context)
          : null,
        trace_excerpt: entry.trace_excerpt ?? null,
      }
    );
  }

  async function close() {
    await pool.end();
  }

  return {
    loadBotData,
    insertMatchLog,
    insertErrorLog,
    close,
  };
}
