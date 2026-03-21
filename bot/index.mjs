import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { Bot, GrammyError, HttpError } from "grammy";

import { loadCache, saveCache } from "./lib/cache-store.mjs";
import { createOpsStore } from "./lib/ops-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const CONFIDENCE_PRIORITY = {
  high: 0,
  low: 1,
};

const state = {
  startedAt: new Date().toISOString(),
  dataSource: null,
  rulesCount: 0,
  knowledgeCount: 0,
  highConfidenceRules: 0,
  lowConfidenceRules: 0,
  lastRuleReloadAt: null,
  lastRuleReloadErrorAt: null,
  lastRuleReloadErrorMessage: null,
  lastKnowledgeReloadAt: null,
  lastMessageAt: null,
  lastMatchedRuleId: null,
  lastMatchedKnowledgeId: null,
  lastReplyAt: null,
  lastReplyErrorAt: null,
  lastReplyErrorMessage: null,
  lastTelegramErrorAt: null,
  lastTelegramErrorMessage: null,
};

let compiledRules = [];
let knowledgeItems = [];
let rulesWatcher = null;
let rulesReloadTimer = null;
let healthServer = null;
let refreshTimer = null;
let opsStore = null;

function log(level, event, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function formatError(error) {
  if (error instanceof GrammyError) {
    return {
      name: error.name,
      message: error.message,
      description: error.description,
      error_code: error.error_code,
      method: error.method,
      payload: error.payload,
    };
  }

  if (error instanceof HttpError) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause?.message ?? String(error.cause ?? ""),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAllowedChatIds(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function chooseRandomReply(replies) {
  const index = Math.floor(Math.random() * replies.length);
  return {
    index,
    text: replies[index],
  };
}

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

function loadJsonArrayFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must be an array`);
  }

  return parsed;
}

function loadRulesFromDisk(rulesFile) {
  return loadJsonArrayFile(rulesFile)
    .filter((rule) => rule && rule.enabled !== false)
    .map((rule, index) => normalizeRule(rule, index))
    .sort((left, right) => {
      const confidenceDelta =
        CONFIDENCE_PRIORITY[left.confidence] - CONFIDENCE_PRIORITY[right.confidence];

      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }

      return left.priority - right.priority;
    });
}

function loadKnowledgeFromDisk(knowledgeFile) {
  return loadJsonArrayFile(knowledgeFile)
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => normalizeKnowledgeItem(item, index))
    .sort((left, right) => left.priority - right.priority);
}

function normalizeReplies(rule, id) {
  if (Array.isArray(rule.replies)) {
    const replies = rule.replies
      .map((reply) => String(reply).trim())
      .filter(Boolean);

    if (replies.length > 0) {
      return replies;
    }
  }

  const reply = String(rule.reply ?? "").trim();
  if (!reply) {
    throw new Error(`Rule ${id} is missing reply or replies`);
  }

  return [reply];
}

function normalizeRule(rule, index) {
  const id = String(rule.id ?? `rule-${index + 1}`);
  const type = String(rule.type ?? "includes").toLowerCase();
  const replies = normalizeReplies(rule, id);
  const caseSensitive = Boolean(rule.caseSensitive);
  const cooldownSeconds = parseNumber(rule.cooldownSeconds, null);
  const priority = parseNumber(rule.priority, index);
  const confidence = String(rule.confidence ?? "high").toLowerCase();
  const supportedTypes = new Set(["includes", "exact", "regex", "word"]);
  const excludeKeywords = Array.isArray(rule.excludeKeywords)
    ? rule.excludeKeywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : [];

  if (!supportedTypes.has(type)) {
    throw new Error(`Rule ${id} has unsupported type: ${type}`);
  }

  if (!Object.hasOwn(CONFIDENCE_PRIORITY, confidence)) {
    throw new Error(`Rule ${id} has unsupported confidence: ${confidence}`);
  }

  if (type === "regex") {
    const pattern = String(rule.pattern ?? "").trim();
    if (!pattern) {
      throw new Error(`Regex rule ${id} is missing pattern`);
    }

    const flags =
      rule.flags == null ? (caseSensitive ? "" : "i") : String(rule.flags);

    return {
      id,
      externalId: rule.externalId ?? null,
      type,
      confidence,
      priority,
      replies,
      cooldownMs: cooldownSeconds == null ? null : cooldownSeconds * 1000,
      matcher: new RegExp(pattern, flags),
      excludeKeywords,
      matches(text) {
        if (hasExcludedKeyword(text, this.excludeKeywords, caseSensitive)) {
          return false;
        }

        this.matcher.lastIndex = 0;
        return this.matcher.test(text);
      },
    };
  }

  const keywords = Array.isArray(rule.keywords)
    ? rule.keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : [];

  if (keywords.length === 0) {
    throw new Error(`Rule ${id} must have at least one keyword`);
  }

  const normalizedKeywords = caseSensitive
    ? keywords
    : keywords.map((keyword) => keyword.toLowerCase());

  return {
    id,
    externalId: rule.externalId ?? null,
    type,
    confidence,
    priority,
    replies,
    cooldownMs: cooldownSeconds == null ? null : cooldownSeconds * 1000,
    excludeKeywords,
    matches(text) {
      const target = caseSensitive ? text : text.toLowerCase();

      if (hasExcludedKeyword(text, this.excludeKeywords, caseSensitive)) {
        return false;
      }

      if (type === "exact") {
        return normalizedKeywords.includes(target);
      }

      if (type === "word") {
        return normalizedKeywords.some((keyword) => {
          const flags = caseSensitive ? "g" : "gi";
          const pattern = new RegExp(
            `(^|\\s|[,.!?;:()\\[\\]{}'"-])${escapeRegex(keyword)}($|\\s|[,.!?;:()\\[\\]{}'"-])`,
            flags
          );
          return pattern.test(text);
        });
      }

      return normalizedKeywords.some((keyword) => target.includes(keyword));
    },
  };
}

function normalizeKnowledgeItem(item, index) {
  const id = String(item.id ?? `knowledge-${index + 1}`);
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : [];

  return {
    id,
    externalId: item.externalId ?? null,
    title: String(item.title ?? id),
    priority: parseNumber(item.priority, index),
    keywords,
    normalizedKeywords: keywords.map((keyword) => keyword.toLowerCase()),
    responseText: String(item.responseText ?? item.summary ?? "").trim(),
    summary: String(item.summary ?? "").trim(),
    content: String(item.content ?? "").trim(),
  };
}

function hasExcludedKeyword(text, excludeKeywords, caseSensitive) {
  if (!excludeKeywords || excludeKeywords.length === 0) {
    return false;
  }

  const target = caseSensitive ? text : text.toLowerCase();
  const normalizedExcludedKeywords = caseSensitive
    ? excludeKeywords
    : excludeKeywords.map((keyword) => keyword.toLowerCase());

  return normalizedExcludedKeywords.some((keyword) => target.includes(keyword));
}

function buildReplyOptions(messageId, replyToMessage) {
  if (!replyToMessage) {
    return {};
  }

  return {
    reply_parameters: {
      message_id: messageId,
    },
  };
}

function updateStateCounts(rules, knowledge) {
  const highConfidenceRules = rules.filter((rule) => rule.confidence === "high").length;
  const lowConfidenceRules = rules.length - highConfidenceRules;

  state.rulesCount = rules.length;
  state.knowledgeCount = knowledge.length;
  state.highConfidenceRules = highConfidenceRules;
  state.lowConfidenceRules = lowConfidenceRules;
}

function createHealthPayload() {
  return {
    ok: true,
    started_at: state.startedAt,
    uptime_seconds: Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000),
    data_source: state.dataSource,
    rules_count: state.rulesCount,
    knowledge_count: state.knowledgeCount,
    high_confidence_rules: state.highConfidenceRules,
    low_confidence_rules: state.lowConfidenceRules,
    last_rule_reload_at: state.lastRuleReloadAt,
    last_rule_reload_error_at: state.lastRuleReloadErrorAt,
    last_rule_reload_error_message: state.lastRuleReloadErrorMessage,
    last_knowledge_reload_at: state.lastKnowledgeReloadAt,
    last_message_at: state.lastMessageAt,
    last_matched_rule_id: state.lastMatchedRuleId,
    last_matched_knowledge_id: state.lastMatchedKnowledgeId,
    last_reply_at: state.lastReplyAt,
    last_reply_error_at: state.lastReplyErrorAt,
    last_reply_error_message: state.lastReplyErrorMessage,
    last_telegram_error_at: state.lastTelegramErrorAt,
    last_telegram_error_message: state.lastTelegramErrorMessage,
  };
}

function startHealthServer() {
  if (!healthEnabled) {
    log("info", "health.disabled", {});
    return;
  }

  healthServer = http.createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(createHealthPayload()));
  });

  healthServer.on("error", (error) => {
    log("error", "health.failed", {
      host: healthHost,
      port: healthPort,
      error: formatError(error),
    });
  });

  healthServer.listen(healthPort, healthHost, () => {
    log("info", "health.started", {
      host: healthHost,
      port: healthPort,
      path: "/health",
    });
  });
}

const validateOnly = process.argv.includes("--check");
const botToken = validateOnly
  ? process.env.BOT_TOKEN?.trim() || "check-only-token"
  : getRequiredEnv("BOT_TOKEN");
const allowedChatIds = parseAllowedChatIds(process.env.ALLOWED_CHAT_IDS);
const defaultCooldownMs =
  parseNumber(process.env.DEFAULT_COOLDOWN_SECONDS, 60) * 1000;
const replyToMessage = parseBoolean(process.env.REPLY_TO_MESSAGE, true);
const dropPendingUpdates = parseBoolean(process.env.DROP_PENDING_UPDATES, true);
const enableLowConfidence = parseBoolean(process.env.ENABLE_LOW_CONFIDENCE, true);
const enableKnowledgeFallback = parseBoolean(process.env.ENABLE_KNOWLEDGE_FALLBACK, true);
const healthEnabled = parseBoolean(process.env.HEALTH_ENABLED, true);
const healthHost = process.env.HEALTH_HOST?.trim() || "127.0.0.1";
const healthPort = parseNumber(process.env.HEALTH_PORT, 3939);
const logMessageText = parseBoolean(process.env.LOG_MESSAGE_TEXT, true);
const maxLogTextLength = parseNumber(process.env.MAX_LOG_TEXT_LENGTH, 120);
const opsDataSource = process.env.OPS_DATA_SOURCE?.trim() || "local";
const opsRefreshSeconds = parseNumber(process.env.OPS_REFRESH_SECONDS, 60);
const opsWriteLogsToRds = parseBoolean(process.env.OPS_WRITE_LOGS_TO_RDS, false);
const rulesFile = path.resolve(
  __dirname,
  process.env.RULES_FILE?.trim() || "./rules.json"
);
const knowledgeFile = path.resolve(
  __dirname,
  process.env.KNOWLEDGE_FILE?.trim() || "./knowledge.json"
);
const opsCacheFile = path.resolve(
  __dirname,
  process.env.OPS_CACHE_FILE?.trim() || "./cache/ops-config-cache.json"
);

const cooldownMap = new Map();
const bot = new Bot(botToken);

if (opsDataSource === "rds") {
  opsStore = createOpsStore({
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
      poolMax: parseNumber(process.env.OPS_DB_POOL_MAX, 10),
    },
  });
}

async function writeErrorLogToOps(entry) {
  if (!opsStore || !opsWriteLogsToRds) {
    return;
  }

  try {
    await opsStore.insertErrorLog(entry);
  } catch (error) {
    log("error", "ops.error_log_write_failed", {
      source: entry.source,
      error: formatError(error),
    });
  }
}

async function writeMatchLogToOps(entry) {
  if (!opsStore || !opsWriteLogsToRds) {
    return;
  }

  try {
    await opsStore.insertMatchLog(entry);
  } catch (error) {
    log("error", "ops.match_log_write_failed", {
      status: entry.status,
      source_kind: entry.source_kind,
      error: formatError(error),
    });
  }
}

function applyDataSnapshot(rules, knowledge, dataSource, reason) {
  compiledRules = rules;
  knowledgeItems = knowledge;
  state.dataSource = dataSource;
  state.lastRuleReloadAt = new Date().toISOString();
  state.lastKnowledgeReloadAt = state.lastRuleReloadAt;
  state.lastRuleReloadErrorAt = null;
  state.lastRuleReloadErrorMessage = null;
  updateStateCounts(rules, knowledge);

  log("info", "config.reloaded", {
    reason,
    data_source: dataSource,
    rules_count: state.rulesCount,
    knowledge_count: state.knowledgeCount,
    high_confidence_rules: state.highConfidenceRules,
    low_confidence_rules: state.lowConfidenceRules,
  });
}

function loadLocalSnapshot() {
  return {
    rules: loadRulesFromDisk(rulesFile),
    knowledge: loadKnowledgeFromDisk(knowledgeFile),
  };
}

async function reloadData(reason) {
  if (opsDataSource === "local") {
    const local = loadLocalSnapshot();
    applyDataSnapshot(local.rules, local.knowledge, "local", reason);
    return;
  }

  try {
    const remote = await opsStore.loadBotData();
    const normalizedRules = remote.rules
      .map((rule, index) => normalizeRule(rule, index))
      .sort((left, right) => {
        const confidenceDelta =
          CONFIDENCE_PRIORITY[left.confidence] - CONFIDENCE_PRIORITY[right.confidence];

        if (confidenceDelta !== 0) {
          return confidenceDelta;
        }

        return left.priority - right.priority;
      });
    const normalizedKnowledge = remote.knowledgeItems
      .map((item, index) => normalizeKnowledgeItem(item, index))
      .sort((left, right) => left.priority - right.priority);

    saveCache(opsCacheFile, {
      source: "ops_rds",
      rules: remote.rules,
      knowledgeItems: remote.knowledgeItems,
    });

    applyDataSnapshot(normalizedRules, normalizedKnowledge, "ops_rds", reason);

    log("info", "ops.service_bound", {
      service_id: remote.service?.id ?? null,
      system_code: remote.service?.system_code ?? null,
      module_code: remote.service?.module_code ?? null,
      service_code: remote.service?.code ?? null,
      environment_code: remote.service?.environment_code ?? null,
      active_rule_set_id: remote.runtimeBinding?.active_rule_set_id ?? null,
      active_knowledge_base_id: remote.runtimeBinding?.active_knowledge_base_id ?? null,
      active_ai_policy_id: remote.runtimeBinding?.active_ai_policy_id ?? null,
    });
  } catch (error) {
    const formattedError = formatError(error);
    state.lastRuleReloadErrorAt = new Date().toISOString();
    state.lastRuleReloadErrorMessage = formattedError.message;

    log("error", "config.reload_failed", {
      reason,
      data_source: "ops_rds",
      error: formattedError,
    });

    await writeErrorLogToOps({
      source: "config_reload",
      error_code: formattedError.error_code ?? null,
      error_message: formattedError.message,
      error_context: formattedError,
    });

    const cachePayload = loadCache(opsCacheFile);
    if (cachePayload?.rules) {
      const cachedRules = cachePayload.rules
        .map((rule, index) => normalizeRule(rule, index))
        .sort((left, right) => {
          const confidenceDelta =
            CONFIDENCE_PRIORITY[left.confidence] - CONFIDENCE_PRIORITY[right.confidence];

          if (confidenceDelta !== 0) {
            return confidenceDelta;
          }

          return left.priority - right.priority;
        });
      const cachedKnowledge = Array.isArray(cachePayload.knowledgeItems)
        ? cachePayload.knowledgeItems
            .map((item, index) => normalizeKnowledgeItem(item, index))
            .sort((left, right) => left.priority - right.priority)
        : [];
      applyDataSnapshot(cachedRules, cachedKnowledge, "cache_fallback", `${reason}:cache`);
      return;
    }

    const local = loadLocalSnapshot();
    applyDataSnapshot(local.rules, local.knowledge, "local_fallback", `${reason}:local_fallback`);
  }
}

function watchLocalFiles() {
  if (opsDataSource !== "local") {
    return;
  }

  const files = [rulesFile, knowledgeFile];

  for (const file of files) {
    const dir = path.dirname(file);
    const filename = path.basename(file);

    fs.mkdirSync(dir, { recursive: true });

    const watcher = fs.watch(dir, (eventType, changedFile) => {
      if (!changedFile || changedFile !== filename) {
        return;
      }

      clearTimeout(rulesReloadTimer);
      rulesReloadTimer = setTimeout(async () => {
        try {
          await reloadData(`fs.watch:${eventType}:${filename}`);
        } catch (error) {
          const formattedError = formatError(error);
          state.lastRuleReloadErrorAt = new Date().toISOString();
          state.lastRuleReloadErrorMessage = formattedError.message;
          log("error", "config.watch_reload_failed", {
            file,
            error: formattedError,
          });
        }
      }, 300);
    });

    if (!rulesWatcher) {
      rulesWatcher = [];
    }

    rulesWatcher.push(watcher);
  }
}

function startOpsRefreshLoop() {
  if (opsDataSource !== "rds" || opsRefreshSeconds <= 0) {
    return;
  }

  refreshTimer = setInterval(async () => {
    await reloadData("interval_refresh");
  }, opsRefreshSeconds * 1000);
  refreshTimer.unref();
}

function cleanupCooldowns() {
  const now = Date.now();
  for (const [key, expiresAt] of cooldownMap.entries()) {
    if (expiresAt <= now) {
      cooldownMap.delete(key);
    }
  }
}

function canReply(chatId, sourceKey, cooldownMs) {
  const effectiveCooldownMs = cooldownMs ?? defaultCooldownMs;

  if (effectiveCooldownMs <= 0) {
    return true;
  }

  const key = `${chatId}:${sourceKey}`;
  const now = Date.now();
  const expiresAt = cooldownMap.get(key);

  if (expiresAt && expiresAt > now) {
    return false;
  }

  cooldownMap.set(key, now + effectiveCooldownMs);
  return true;
}

function findKnowledgeMatch(text) {
  if (!enableKnowledgeFallback) {
    return null;
  }

  const target = text.toLowerCase();
  return knowledgeItems.find((item) =>
    item.normalizedKeywords.some((keyword) => target.includes(keyword))
  );
}

await reloadData("startup");

if (validateOnly) {
  process.exit(0);
}

watchLocalFiles();
startHealthServer();
startOpsRefreshLoop();

bot.catch(async (botError) => {
  const formattedError = formatError(botError.error ?? botError);
  state.lastTelegramErrorAt = new Date().toISOString();
  state.lastTelegramErrorMessage = formattedError.message;

  log("error", "telegram.unhandled_error", {
    update_id: botError.ctx?.update?.update_id,
    error: formattedError,
  });

  await writeErrorLogToOps({
    source: "telegram_unhandled",
    chat_id: botError.ctx?.chat?.id ?? null,
    message_id: botError.ctx?.message?.message_id ?? null,
    error_code: formattedError.error_code ?? null,
    error_message: formattedError.message,
    error_context: formattedError,
  });
});

bot.on("message:text", async (ctx) => {
  const { chat, from, message } = ctx;

  if (!chat || !message) {
    log("info", "message.ignored", {
      reason: "missing_chat_or_message",
    });
    return;
  }

  const text = message.text.trim();
  const messageExcerpt = truncateText(text, 500);
  const logFields = {
    chat_id: chat.id,
    chat_type: chat.type,
    from_id: from?.id ?? null,
    from_is_bot: Boolean(from?.is_bot),
    message_id: message.message_id,
    text: logMessageText ? truncateText(text, maxLogTextLength) : undefined,
  };

  state.lastMessageAt = new Date().toISOString();
  log("info", "message.received", logFields);

  if (!["group", "supergroup"].includes(chat.type)) {
    log("info", "message.ignored", {
      ...logFields,
      reason: "chat_not_group",
    });
    return;
  }

  if (from?.is_bot) {
    log("info", "message.ignored", {
      ...logFields,
      reason: "sender_is_bot",
    });
    return;
  }

  if (allowedChatIds.size > 0 && !allowedChatIds.has(String(chat.id))) {
    log("info", "message.ignored", {
      ...logFields,
      reason: "chat_not_allowed",
      allowed_chat_ids: [...allowedChatIds],
    });
    return;
  }

  if (!text) {
    log("info", "message.ignored", {
      ...logFields,
      reason: "empty_text",
    });
    return;
  }

  let matchedRule = null;
  for (const rule of compiledRules) {
    if (rule.confidence === "low" && !enableLowConfidence) {
      continue;
    }

    if (!rule.matches(text)) {
      continue;
    }

    matchedRule = rule;
    break;
  }

  const matchedKnowledge = matchedRule ? null : findKnowledgeMatch(text);

  if (!matchedRule && !matchedKnowledge) {
    log("info", "message.no_match", logFields);
    return;
  }

  const sourceKind = matchedRule ? "rule" : "knowledge";
  const sourceId = matchedRule?.id ?? matchedKnowledge.id;
  const confidence = matchedRule?.confidence ?? "knowledge";
  const cooldownMs = matchedRule?.cooldownMs ?? defaultCooldownMs;

  if (!canReply(chat.id, sourceId, cooldownMs)) {
    log("info", "message.cooldown_blocked", {
      ...logFields,
      source_kind: sourceKind,
      source_id: sourceId,
      confidence,
    });

    await writeMatchLogToOps({
      source_kind: sourceKind,
      chat_id: chat.id,
      message_id: message.message_id,
      from_id: from?.id ?? null,
      rule_id: matchedRule?.externalId ?? null,
      knowledge_item_id: matchedKnowledge?.externalId ?? null,
      confidence,
      status: "cooldown_blocked",
      message_excerpt: messageExcerpt,
      reply_preview: null,
      extra_context: null,
    });
    return;
  }

  const selectedReply = matchedRule
    ? chooseRandomReply(matchedRule.replies)
    : { index: 0, text: matchedKnowledge.responseText || matchedKnowledge.summary };

  state.lastMatchedRuleId = matchedRule?.id ?? null;
  state.lastMatchedKnowledgeId = matchedKnowledge?.id ?? null;

  try {
    await ctx.reply(
      selectedReply.text,
      buildReplyOptions(message.message_id, replyToMessage)
    );

    state.lastReplyAt = new Date().toISOString();
    state.lastReplyErrorAt = null;
    state.lastReplyErrorMessage = null;

    log("info", "message.replied", {
      ...logFields,
      source_kind: sourceKind,
      source_id: sourceId,
      confidence,
      reply_template_index: selectedReply.index,
    });

    await writeMatchLogToOps({
      source_kind: sourceKind,
      chat_id: chat.id,
      message_id: message.message_id,
      from_id: from?.id ?? null,
      rule_id: matchedRule?.externalId ?? null,
      knowledge_item_id: matchedKnowledge?.externalId ?? null,
      confidence,
      status: "replied",
      message_excerpt: messageExcerpt,
      reply_preview: truncateText(selectedReply.text, 500),
      extra_context: {
        reply_template_index: selectedReply.index,
      },
    });
  } catch (error) {
    const formattedError = formatError(error);
    state.lastReplyErrorAt = new Date().toISOString();
    state.lastReplyErrorMessage = formattedError.message;

    log("error", "message.reply_failed", {
      ...logFields,
      source_kind: sourceKind,
      source_id: sourceId,
      confidence,
      error: formattedError,
    });

    await writeMatchLogToOps({
      source_kind: sourceKind,
      chat_id: chat.id,
      message_id: message.message_id,
      from_id: from?.id ?? null,
      rule_id: matchedRule?.externalId ?? null,
      knowledge_item_id: matchedKnowledge?.externalId ?? null,
      confidence,
      status: "reply_failed",
      message_excerpt: messageExcerpt,
      reply_preview: truncateText(selectedReply.text, 500),
      extra_context: formattedError,
    });

    await writeErrorLogToOps({
      source: "message_reply",
      chat_id: chat.id,
      message_id: message.message_id,
      error_code: formattedError.error_code ?? null,
      error_message: formattedError.message,
      error_context: formattedError,
    });
  }
});

setInterval(cleanupCooldowns, 10 * 60 * 1000).unref();

process.once("SIGINT", async () => {
  rulesWatcher?.forEach((watcher) => watcher.close());
  healthServer?.close();
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  bot.stop();
  await opsStore?.close();
});

process.once("SIGTERM", async () => {
  rulesWatcher?.forEach((watcher) => watcher.close());
  healthServer?.close();
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  bot.stop();
  await opsStore?.close();
});

log("info", "bot.starting", {
  data_source: state.dataSource,
  rules_count: state.rulesCount,
  knowledge_count: state.knowledgeCount,
  high_confidence_rules: state.highConfidenceRules,
  low_confidence_rules: state.lowConfidenceRules,
  low_confidence_enabled: enableLowConfidence,
  knowledge_fallback_enabled: enableKnowledgeFallback,
  allowed_groups:
    allowedChatIds.size === 0 ? "all groups" : [...allowedChatIds].join(", "),
});

await bot.start({
  allowed_updates: ["message"],
  drop_pending_updates: dropPendingUpdates,
});
