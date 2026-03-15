import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { Bot, GrammyError, HttpError } from "grammy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const CONFIDENCE_PRIORITY = {
  high: 0,
  low: 1,
};

const state = {
  startedAt: new Date().toISOString(),
  lastRuleReloadAt: null,
  lastRuleReloadErrorAt: null,
  lastRuleReloadErrorMessage: null,
  lastMessageAt: null,
  lastMatchedRuleId: null,
  lastReplyAt: null,
  lastReplyErrorAt: null,
  lastReplyErrorMessage: null,
  lastTelegramErrorAt: null,
  lastTelegramErrorMessage: null,
  rulesCount: 0,
  highConfidenceRules: 0,
  lowConfidenceRules: 0,
  uptimeSeconds: 0,
};

let compiledRules = [];
let rulesWatcher = null;
let rulesReloadTimer = null;
let healthServer = null;

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

function loadRulesFromDisk(rulesFile) {
  const raw = fs.readFileSync(rulesFile, "utf8");
  const rules = JSON.parse(raw);

  if (!Array.isArray(rules)) {
    throw new Error("rules.json must be an array");
  }

  return rules
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

function updateRulesState(rules) {
  const highConfidenceRules = rules.filter((rule) => rule.confidence === "high").length;
  const lowConfidenceRules = rules.length - highConfidenceRules;

  state.rulesCount = rules.length;
  state.highConfidenceRules = highConfidenceRules;
  state.lowConfidenceRules = lowConfidenceRules;
}

function reloadRules(rulesFile, reason) {
  const nextRules = loadRulesFromDisk(rulesFile);
  compiledRules = nextRules;
  updateRulesState(nextRules);
  state.lastRuleReloadAt = new Date().toISOString();
  state.lastRuleReloadErrorAt = null;
  state.lastRuleReloadErrorMessage = null;

  log("info", "rules.reloaded", {
    reason,
    rules_count: state.rulesCount,
    high_confidence_rules: state.highConfidenceRules,
    low_confidence_rules: state.lowConfidenceRules,
    rules_file: rulesFile,
  });
}

function watchRulesFile(rulesFile) {
  const rulesDir = path.dirname(rulesFile);
  const rulesName = path.basename(rulesFile);

  rulesWatcher = fs.watch(rulesDir, (eventType, filename) => {
    if (!filename || filename !== rulesName) {
      return;
    }

    clearTimeout(rulesReloadTimer);
    rulesReloadTimer = setTimeout(() => {
      try {
        reloadRules(rulesFile, `fs.watch:${eventType}`);
      } catch (error) {
        state.lastRuleReloadErrorAt = new Date().toISOString();
        state.lastRuleReloadErrorMessage = formatError(error).message;
        log("error", "rules.reload_failed", {
          reason: `fs.watch:${eventType}`,
          rules_file: rulesFile,
          error: formatError(error),
        });
      }
    }, 300);
  });
}

function cleanupCooldowns() {
  const now = Date.now();
  for (const [key, expiresAt] of cooldownMap.entries()) {
    if (expiresAt <= now) {
      cooldownMap.delete(key);
    }
  }
}

function canReply(chatId, rule) {
  const cooldownMs = rule.cooldownMs ?? defaultCooldownMs;

  if (cooldownMs <= 0) {
    return true;
  }

  const key = `${chatId}:${rule.id}`;
  const now = Date.now();
  const expiresAt = cooldownMap.get(key);

  if (expiresAt && expiresAt > now) {
    return false;
  }

  cooldownMap.set(key, now + cooldownMs);
  return true;
}

function createHealthPayload() {
  return {
    ok: true,
    started_at: state.startedAt,
    uptime_seconds: Math.floor((Date.now() - Date.parse(state.startedAt)) / 1000),
    rules_count: state.rulesCount,
    high_confidence_rules: state.highConfidenceRules,
    low_confidence_rules: state.lowConfidenceRules,
    last_rule_reload_at: state.lastRuleReloadAt,
    last_rule_reload_error_at: state.lastRuleReloadErrorAt,
    last_rule_reload_error_message: state.lastRuleReloadErrorMessage,
    last_message_at: state.lastMessageAt,
    last_matched_rule_id: state.lastMatchedRuleId,
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
const healthEnabled = parseBoolean(process.env.HEALTH_ENABLED, true);
const healthHost = process.env.HEALTH_HOST?.trim() || "127.0.0.1";
const healthPort = parseNumber(process.env.HEALTH_PORT, 3939);
const logMessageText = parseBoolean(process.env.LOG_MESSAGE_TEXT, true);
const maxLogTextLength = parseNumber(process.env.MAX_LOG_TEXT_LENGTH, 120);
const rulesFile = path.resolve(
  __dirname,
  process.env.RULES_FILE?.trim() || "./rules.json"
);

const cooldownMap = new Map();
const bot = new Bot(botToken);

reloadRules(rulesFile, "startup");

if (validateOnly) {
  process.exit(0);
}

watchRulesFile(rulesFile);
startHealthServer();

bot.catch((botError) => {
  const formattedError = formatError(botError.error ?? botError);
  state.lastTelegramErrorAt = new Date().toISOString();
  state.lastTelegramErrorMessage = formattedError.message;

  log("error", "telegram.unhandled_error", {
    update_id: botError.ctx?.update?.update_id,
    error: formattedError,
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

  if (!matchedRule) {
    log("info", "message.no_match", logFields);
    return;
  }

  if (!canReply(chat.id, matchedRule)) {
    log("info", "message.cooldown_blocked", {
      ...logFields,
      rule_id: matchedRule.id,
      confidence: matchedRule.confidence,
    });
    return;
  }

  const selectedReply = chooseRandomReply(matchedRule.replies);
  state.lastMatchedRuleId = matchedRule.id;

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
      rule_id: matchedRule.id,
      confidence: matchedRule.confidence,
      reply_template_index: selectedReply.index,
    });
  } catch (error) {
    const formattedError = formatError(error);
    state.lastReplyErrorAt = new Date().toISOString();
    state.lastReplyErrorMessage = formattedError.message;

    log("error", "message.reply_failed", {
      ...logFields,
      rule_id: matchedRule.id,
      confidence: matchedRule.confidence,
      error: formattedError,
    });
  }
});

setInterval(cleanupCooldowns, 10 * 60 * 1000).unref();

process.once("SIGINT", () => {
  rulesWatcher?.close();
  healthServer?.close();
  bot.stop();
});

process.once("SIGTERM", () => {
  rulesWatcher?.close();
  healthServer?.close();
  bot.stop();
});

log("info", "bot.starting", {
  rules_count: state.rulesCount,
  high_confidence_rules: state.highConfidenceRules,
  low_confidence_rules: state.lowConfidenceRules,
  low_confidence_enabled: enableLowConfidence,
  allowed_groups:
    allowedChatIds.size === 0 ? "all groups" : [...allowedChatIds].join(", "),
});

await bot.start({
  allowed_updates: ["message"],
  drop_pending_updates: dropPendingUpdates,
});
