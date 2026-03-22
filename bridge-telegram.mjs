#!/usr/bin/env node
/**
 * bridge-telegram.mjs — Claude Anywhere Free Tier
 *
 * Free tier limits:
 *   - Single-turn conversations (no --resume)
 *   - 5 messages/day per user
 *   - Text only (no image/file analysis)
 *   - Upgrade prompt appended to every reply
 */

import TelegramBot from "node-telegram-bot-api";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getLicenseTier, activateLicense } from "./license-client.mjs";

// Load .env if present
try {
  const envPath = new URL(".env", import.meta.url).pathname;
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
} catch {}

// ============ Config ============
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and fill in the token.");
  process.exit(1);
}

const CLAUDE_PATH = process.env.CLAUDE_PATH?.trim() || "claude";
const CLAUDE_CWD  = process.env.CLAUDE_CWD?.trim()  || process.cwd();
const CLAUDE_TIMEOUT_MS = 600_000;
const MAX_REPLY_LENGTH  = 4000;
const FREE_DAILY_LIMIT  = 5;
const TRIAL_DAYS        = 7;
const UPGRADE_URL = "gumroad.com/l/claude-anywhere";
const UPGRADE_AD  = `\n\n💡 Upgrade to Pro: unlimited chat, multi-turn, image, file, WeChat → ${UPGRADE_URL} ($4.99/mo)`;

// Trial state persisted locally
const STATE_DIR  = join(homedir(), ".claude-anywhere-free");
const TRIAL_FILE = join(STATE_DIR, "telegram-trial.json");
mkdirSync(STATE_DIR, { recursive: true });

function loadTrialState() {
  try {
    if (existsSync(TRIAL_FILE)) return JSON.parse(readFileSync(TRIAL_FILE, "utf-8"));
  } catch {}
  return {};
}

function saveTrialState(state) {
  try { writeFileSync(TRIAL_FILE, JSON.stringify(state, null, 2)); } catch {}
}

// { [userId]: "YYYY-MM-DD" }  — date of first use
const trialState = loadTrialState();

function checkTrialExpired(userId) {
  const today = todayStr();
  if (!trialState[userId]) {
    trialState[userId] = today;
    saveTrialState(trialState);
    return false;
  }
  const daysDiff = Math.floor((new Date(today) - new Date(trialState[userId])) / 86400000);
  return daysDiff >= TRIAL_DAYS;
}
// ================================

const logger = {
  info:  (...a) => console.log(new Date().toISOString(), "[INFO]",  ...a),
  warn:  (...a) => console.warn(new Date().toISOString(), "[WARN]",  ...a),
  error: (...a) => console.error(new Date().toISOString(), "[ERROR]", ...a),
};

// ============ Daily counter (local fallback) ============
// Map<userId, { date: "YYYY-MM-DD", count: number }>
const dailyCount = new Map();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyUsage(userId) {
  const today = todayStr();
  const entry = dailyCount.get(userId);
  if (!entry || entry.date !== today) return 0;
  return entry.count;
}

function incrementDailyUsage(userId) {
  const today = todayStr();
  const entry = dailyCount.get(userId);
  if (!entry || entry.date !== today) {
    dailyCount.set(userId, { date: today, count: 1 });
  } else {
    entry.count += 1;
  }
}

// Check daily quota via license server, fallback to local counter.
async function checkAndIncrementQuota(userId) {
  const serverUrl = process.env.LICENSE_SERVER_URL?.trim() || "https://license.claudeanywhere.com";
  const key = process.env.LICENSE_KEY?.trim();

  try {
    const res = await fetch(`${serverUrl}/v1/daily_count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, license_key: key || null }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      // Server returns { allowed: bool, used: number, limit: number }
      if (!data.allowed) return { allowed: false, used: data.used, limit: data.limit };
      return { allowed: true, used: data.used, limit: data.limit };
    }
  } catch {
    // Server unreachable — use local counter
  }

  // Local fallback
  const used = getDailyUsage(userId);
  if (used >= FREE_DAILY_LIMIT) {
    return { allowed: false, used, limit: FREE_DAILY_LIMIT };
  }
  incrementDailyUsage(userId);
  return { allowed: true, used: used + 1, limit: FREE_DAILY_LIMIT };
}

// ============ runClaude ============

function runClaude(message) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", message,
      "--max-turns", "100",
      "--output-format", "json",
      "--dangerously-skip-permissions",
      // No --resume (single-turn)
      // No --add-dir (user's own environment)
    ];

    logger.info(`Claude call: msg="${message.slice(0, 80)}..."`);

    const proc = spawn(CLAUDE_PATH, args, {
      cwd: CLAUDE_CWD,
      env: { ...process.env },
      timeout: CLAUDE_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const MAX_STDERR = 1000;

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      proc.stdout.removeAllListeners();
      proc.stderr.removeAllListeners();
      proc.removeAllListeners();

      if (code === 0 || stdout.trim()) {
        try {
          const json = JSON.parse(stdout.trim());
          resolve(json.result || json.text || stdout.trim());
        } catch {
          resolve(stdout.trim() || `Claude exited with code ${code}`);
        }
      } else {
        logger.error(`Claude exit code: ${code}, stderr: ${stderr.slice(0, 300)}`);
        resolve(`Claude error (code=${code})`);
      }
    });

    proc.on("error", (err) => {
      proc.stdout.removeAllListeners();
      proc.stderr.removeAllListeners();
      proc.removeAllListeners();
      reject(new Error(`Failed to start Claude: ${err.message}`));
    });

    proc.stdin.end();
  });
}

// ============ Text splitting ============

function splitText(text, limit = MAX_REPLY_LENGTH) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    let end = limit;
    if (remaining.length > limit) {
      const lastNL = remaining.lastIndexOf("\n", limit);
      if (lastNL > limit * 0.5) end = lastNL;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return chunks;
}

// ============ Bot ============

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const processing = new Set();

logger.info("Claude Anywhere (free tier) starting...");

// /new /reset — no-op in free tier (every message is already single-turn)
bot.onText(/^\/(new|reset)$/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "✅ Each message is already a fresh conversation in the free tier.\n" +
    `💡 Want multi-turn sessions? Upgrade to Pro → ${UPGRADE_URL}`
  );
});

// /status
bot.onText(/^\/status$/, async (msg) => {
  const userId = String(msg.from.id);
  const tier = await getLicenseTier();
  const used = getDailyUsage(userId);
  const remaining = Math.max(0, FREE_DAILY_LIMIT - used);

  if (tier === "pro") {
    await bot.sendMessage(msg.chat.id, "✅ Pro license active — unlimited messages.");
  } else {
    await bot.sendMessage(msg.chat.id,
      `📊 Free tier\n` +
      `Today: ${used}/${FREE_DAILY_LIMIT} messages used, ${remaining} remaining\n\n` +
      `💡 Upgrade to Pro → ${UPGRADE_URL} ($4.99/mo)`
    );
  }
});

// /help
bot.onText(/^\/help$/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "🤖 *Claude Anywhere* — Free Tier\n\n" +
    "*Commands:*\n" +
    "/new — Start fresh (already the default)\n" +
    "/status — Show tier & daily usage\n" +
    "/activate <key> — Activate Pro license\n" +
    "/help — This message\n\n" +
    "*Free vs Pro:*\n" +
    "```\n" +
    "Feature          Free    Pro\n" +
    "─────────────────────────────\n" +
    "Messages/day     5       ∞\n" +
    "Multi-turn       ✗       ✓\n" +
    "Image analysis   ✗       ✓\n" +
    "File analysis    ✗       ✓\n" +
    "WeChat support   ✗       ✓\n" +
    "Ads              ✓       ✗\n" +
    "```\n\n" +
    `💡 Upgrade → ${UPGRADE_URL} ($4.99/mo)`,
    { parse_mode: "Markdown" }
  );
});

// /activate <key>
bot.onText(/^\/activate(?:\s+(.+))?$/, async (msg, match) => {
  const key = match?.[1]?.trim();
  if (!key) {
    await bot.sendMessage(msg.chat.id, `Usage: /activate <license-key>\n\nGet a key → ${UPGRADE_URL}`);
    return;
  }
  await bot.sendMessage(msg.chat.id, "🔑 Validating license...");
  const result = await activateLicense(key);
  if (result.success) {
    await bot.sendMessage(msg.chat.id,
      `✅ ${result.message}\n\nSet LICENSE_KEY=${key} in your .env file and restart the bot.`
    );
  } else {
    await bot.sendMessage(msg.chat.id,
      `❌ ${result.message}\n\nGet a valid key → ${UPGRADE_URL}`
    );
  }
});

// Photo — Pro feature gate
bot.on("photo", async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `📷 Image analysis is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($4.99/mo)`
  );
});

// Document — Pro feature gate
bot.on("document", async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `📄 File analysis is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($4.99/mo)`
  );
});

// Text messages
bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  const userId  = String(msg.from.id);
  const text    = msg.text?.trim();
  const msgId   = String(msg.message_id);

  // Skip commands (handled by onText above)
  if (!text || text.startsWith("/")) return;

  if (processing.has(msgId)) return;
  processing.add(msgId);

  logger.info(`Message from [${userId}]: ${text.slice(0, 100)}`);

  try {
    // Check trial period (local check)
    if (checkTrialExpired(userId)) {
      await bot.sendMessage(chatId,
        `⚠️ Your 7-day free trial has expired. Upgrade to Pro for continued access → ${UPGRADE_URL} ($4.99/mo)`
      );
      return;
    }

    // Check daily quota
    const quota = await checkAndIncrementQuota(userId);
    if (!quota.allowed) {
      await bot.sendMessage(chatId,
        `⚠️ Free limit reached (${quota.used}/${quota.limit} today). ` +
        `Upgrade to Pro for unlimited → ${UPGRADE_URL} ($4.99/mo)`
      );
      return;
    }

    await bot.sendMessage(chatId, "🤔 Thinking...");

    const reply = await runClaude(text);

    if (!reply) {
      await bot.sendMessage(chatId, "No response from Claude. Please try again.");
      return;
    }

    // Append upgrade ad to every reply (free tier)
    const fullReply = reply + UPGRADE_AD;
    const chunks = splitText(fullReply);
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk);
    }

    logger.info(`Reply sent: ${reply.length} chars`);
  } catch (err) {
    logger.error("Error processing message:", err.message);
    await bot.sendMessage(chatId, "Error: " + err.message);
  } finally {
    processing.delete(msgId);
  }
});

// Polling error handler
bot.on("polling_error", (err) => {
  logger.error("Polling error:", err.message);
});

process.on("SIGINT",  () => { bot.stopPolling(); process.exit(0); });
process.on("SIGTERM", () => { bot.stopPolling(); process.exit(0); });

logger.info("Bot started. Waiting for messages...");
