import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { Bot } from "grammy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

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

function loadRules(rulesFile) {
  const raw = fs.readFileSync(rulesFile, "utf8");
  const rules = JSON.parse(raw);

  if (!Array.isArray(rules)) {
    throw new Error("rules.json must be an array");
  }

  return rules
    .filter((rule) => rule && rule.enabled !== false)
    .map((rule, index) => normalizeRule(rule, index));
}

function normalizeRule(rule, index) {
  const id = String(rule.id ?? `rule-${index + 1}`);
  const type = String(rule.type ?? "includes").toLowerCase();
  const reply = String(rule.reply ?? "").trim();
  const caseSensitive = Boolean(rule.caseSensitive);
  const cooldownSeconds = parseNumber(rule.cooldownSeconds, null);
  const supportedTypes = new Set(["includes", "exact", "regex", "word"]);
  const excludeKeywords = Array.isArray(rule.excludeKeywords)
    ? rule.excludeKeywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : [];

  if (!reply) {
    throw new Error(`Rule ${id} is missing a reply`);
  }

  if (!supportedTypes.has(type)) {
    throw new Error(`Rule ${id} has unsupported type: ${type}`);
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
      reply,
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
    reply,
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
          const pattern = new RegExp(`(^|\\s|[,.!?;:()\\[\\]{}'"-])${escapeRegex(keyword)}($|\\s|[,.!?;:()\\[\\]{}'"-])`, flags);
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

const validateOnly = process.argv.includes("--check");
const botToken = validateOnly
  ? process.env.BOT_TOKEN?.trim() || "check-only-token"
  : getRequiredEnv("BOT_TOKEN");
const allowedChatIds = parseAllowedChatIds(process.env.ALLOWED_CHAT_IDS);
const defaultCooldownMs =
  parseNumber(process.env.DEFAULT_COOLDOWN_SECONDS, 60) * 1000;
const replyToMessage = parseBoolean(process.env.REPLY_TO_MESSAGE, true);
const dropPendingUpdates = parseBoolean(process.env.DROP_PENDING_UPDATES, true);
const rulesFile = path.resolve(
  __dirname,
  process.env.RULES_FILE?.trim() || "./rules.json"
);

const compiledRules = loadRules(rulesFile);
const cooldownMap = new Map();
const bot = new Bot(botToken);

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

bot.catch((error) => {
  console.error("Telegram bot error:", error.error);
});

bot.on("message:text", async (ctx) => {
  const { chat, from, message } = ctx;

  if (!chat || !message) {
    return;
  }

  if (!["group", "supergroup"].includes(chat.type)) {
    return;
  }

  if (from?.is_bot) {
    return;
  }

  if (allowedChatIds.size > 0 && !allowedChatIds.has(String(chat.id))) {
    return;
  }

  const text = message.text.trim();
  if (!text) {
    return;
  }

  for (const rule of compiledRules) {
    if (!rule.matches(text)) {
      continue;
    }

    if (!canReply(chat.id, rule)) {
      return;
    }

    await ctx.reply(
      rule.reply,
      buildReplyOptions(message.message_id, replyToMessage)
    );
    return;
  }
});

setInterval(cleanupCooldowns, 10 * 60 * 1000).unref();

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

console.log(
  `Starting bot with ${compiledRules.length} rule(s); allowed groups: ${
    allowedChatIds.size === 0 ? "all groups" : [...allowedChatIds].join(", ")
  }`
);

if (validateOnly) {
  process.exit(0);
}

await bot.start({
  allowed_updates: ["message"],
  drop_pending_updates: dropPendingUpdates,
});
