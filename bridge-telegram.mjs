#!/usr/bin/env node
/**
 * bridge-telegram.mjs — Claude Anywhere v2 (Telegram)
 *
 * Unified Free + Pro bridge. Mode determined by LICENSE_KEY at startup:
 *   - LICENSE_KEY set + server validates → Pro mode (full features, no ads)
 *   - No key or validation fails         → Free mode (5/day, 7-day trial, ads)
 *
 * All config from .env — no hardcoded credentials.
 */

import TelegramBot from "node-telegram-bot-api";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import {
  writeFileSync, readFileSync, existsSync, mkdirSync,
  unlinkSync, readdirSync, statSync,
} from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { getLicenseTier, activateLicense } from "./license-client.mjs";

// Load .env if present (manual parse — avoids hard dependency on dotenv at module level)
try {
  const envPath = new URL(".env", import.meta.url).pathname;
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
} catch {}

// ============ Config (all from .env) ============
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is not set. Copy .env.example to .env and fill in the token.");
  process.exit(1);
}

const CLAUDE_PATH       = process.env.CLAUDE_PATH?.trim() || "claude";
const CLAUDE_CWD        = process.env.CLAUDE_CWD?.trim()  || process.cwd();
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || "600000", 10);
const MAX_REPLY_LENGTH  = parseInt(process.env.MAX_REPLY_LENGTH  || "4000",   10);
const MAX_STDERR_LEN    = 1000;
const TMP_DIR           = "/tmp/claude-anywhere-telegram";

// Sessions file (Pro mode)
const SESSIONS_FILE = join(homedir(), ".claude-anywhere", "telegram-sessions.json");

// Free tier constants
const FREE_DAILY_LIMIT = 5;
const TRIAL_DAYS       = 7;
const UPGRADE_URL      = "claudeanywhere.gumroad.com/l/claude-anywhere";
const UPGRADE_AD       = `\n\n💡 Upgrade to Pro: unlimited chat, multi-turn, image, file, WeChat → ${UPGRADE_URL} ($5.99/mo)`;
const LIMIT_MSG        = `⚠️ Free limit reached (5/5 today). Upgrade to Pro for unlimited → ${UPGRADE_URL} ($5.99/mo)`;
const TRIAL_EXPIRED_MSG = `⚠️ Free trial expired (7 days). Upgrade to Pro → ${UPGRADE_URL} ($5.99/mo)`;

// Free tier state dir
const STATE_DIR = join(homedir(), ".claude-anywhere-free");
// ================================================

mkdirSync(TMP_DIR, { recursive: true });
mkdirSync(join(homedir(), ".claude-anywhere"), { recursive: true });
mkdirSync(STATE_DIR, { recursive: true });

const logger = {
  info:  (...a) => console.log( new Date().toISOString(), "[INFO]",  ...a),
  warn:  (...a) => console.warn( new Date().toISOString(), "[WARN]",  ...a),
  error: (...a) => console.error(new Date().toISOString(), "[ERROR]", ...a),
};

// ============ License check (cached, evaluated per-request) ============

let _proMode = null; // null = not yet determined

async function checkPro() {
  if (_proMode !== null) return _proMode;
  const tier = await getLicenseTier();
  _proMode = (tier === "pro");
  logger.info(`Mode: ${_proMode ? "Pro" : "Free"}`);
  return _proMode;
}

// Refresh pro status every 5 minutes (getLicenseTier already caches internally)
async function isProMode() {
  _proMode = null; // let getLicenseTier handle caching
  return await checkPro();
}

// ============ Free tier: daily counter + trial tracking ============

const TRIAL_FILE = join(STATE_DIR, "telegram-trial.json");

function loadTrialState() {
  try {
    if (existsSync(TRIAL_FILE)) return JSON.parse(readFileSync(TRIAL_FILE, "utf-8"));
  } catch {}
  return {};
}

function saveTrialState(state) {
  try { writeFileSync(TRIAL_FILE, JSON.stringify(state, null, 2)); } catch {}
}

const trialState = loadTrialState(); // { [userId]: "YYYY-MM-DD" (firstUseDate) }

// In-memory daily counter: Map<userId, { date, count }>
const dailyCount = new Map();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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

// Check & increment daily quota. Returns { allowed, used, limit }.
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
      return { allowed: !!data.allowed, used: data.used, limit: data.limit };
    }
  } catch {}

  // Local fallback
  const used = getDailyUsage(userId);
  if (used >= FREE_DAILY_LIMIT) return { allowed: false, used, limit: FREE_DAILY_LIMIT };
  incrementDailyUsage(userId);
  return { allowed: true, used: used + 1, limit: FREE_DAILY_LIMIT };
}

// ============ Pro mode: session persistence ============

let userSessions = loadSessions();

function loadSessions() {
  try {
    if (existsSync(SESSIONS_FILE)) {
      return new Map(Object.entries(JSON.parse(readFileSync(SESSIONS_FILE, "utf-8"))));
    }
  } catch {}
  return new Map();
}

function saveSessions() {
  try {
    writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(userSessions), null, 2));
  } catch {}
}

// ============ Pro mode: Claude session list (auto-discover) ============

function getSessionsDirs() {
  const base = join(homedir(), ".claude", "projects");
  if (!existsSync(base)) return [];
  try {
    return readdirSync(base)
      .map(d => join(base, d))
      .filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } });
  } catch {
    return [];
  }
}

function isValidUserText(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trimStart();
  if (t.startsWith("<") || t.startsWith("[{") || t.startsWith("{")) return false;
  if (t.startsWith("图片文件:") || t.startsWith("/tmp/")) return false;
  if (t.startsWith("最近") && t.includes("个会话")) return false;
  if (t.startsWith("Unknown skill:") || t.startsWith("conversations")) return false;
  if (t.length < 2) return false;
  return true;
}

function listClaudeSessions(limit = 10) {
  const dirs = getSessionsDirs();
  const all = [];

  for (const dir of dirs) {
    try {
      const files = readdirSync(dir).filter(f => f.endsWith(".jsonl"));
      for (const f of files) {
        const fullPath = join(dir, f);
        const id = basename(f, ".jsonl");
        let mtime = 0;
        try { mtime = statSync(fullPath).mtimeMs; } catch {}
        let lastUserMsg = "";
        let lastAssistantMsg = "";
        try {
          const lines = readFileSync(fullPath, "utf-8").split("\n");
          for (let i = lines.length - 1; i >= 0; i--) {
            if (!lines[i].trim()) continue;
            try {
              const j = JSON.parse(lines[i]);
              if (!lastUserMsg && j.type === "user" && isValidUserText(j.message?.content)) {
                lastUserMsg = j.message.content.slice(0, 50).replace(/\n/g, " ");
              }
              if (!lastAssistantMsg && j.type === "assistant" && j.message?.content) {
                const c = j.message.content;
                if (typeof c === "string") {
                  lastAssistantMsg = c.slice(0, 50).replace(/\n/g, " ");
                } else if (Array.isArray(c)) {
                  const tb = c.find(b => b.type === "text" && b.text);
                  if (tb) lastAssistantMsg = tb.text.slice(0, 50).replace(/\n/g, " ");
                }
              }
              if (lastUserMsg && lastAssistantMsg) break;
            } catch {}
          }
        } catch {}
        all.push({ id, mtime, lastUserMsg, lastAssistantMsg });
      }
    } catch {}
  }

  return all.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

// ============ Claude invocation ============

function runClaude(message, sessionId = null, imagePaths = []) {
  return new Promise((resolve, reject) => {
    let fullMessage = message;
    if (imagePaths.length > 0) {
      const imgList = imagePaths.map(p => `图片文件: ${p}`).join("\n");
      fullMessage = `${imgList}\n\n${message}\n\n（请用 Read 工具读取上述图片文件来查看图片内容）`;
    }

    const args = [
      "-p", fullMessage,
      "--max-turns", "100",
      "--output-format", "json",
      "--dangerously-skip-permissions",
    ];

    if (sessionId) args.push("--resume", sessionId);

    logger.info(`Claude: ${sessionId ? "resume " + sessionId.slice(0, 8) : "new"} | ${message.slice(0, 80)}`);

    const proc = spawn(CLAUDE_PATH, args, {
      cwd: CLAUDE_CWD,
      env: { ...process.env },
      timeout: CLAUDE_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", c => { stdout += c.toString(); });
    proc.stderr.on("data", c => { if (stderr.length < MAX_STDERR_LEN) stderr += c.toString(); });

    proc.on("close", code => {
      proc.stdout.removeAllListeners();
      proc.stderr.removeAllListeners();
      proc.removeAllListeners();

      if (code === 0 || stdout.trim()) {
        try {
          const json = JSON.parse(stdout.trim());
          resolve({ text: json.result || json.text || stdout.trim(), sessionId: json.session_id || null });
        } catch {
          resolve({ text: stdout.trim(), sessionId: null });
        }
        stdout = "";
      } else {
        logger.error(`Claude exit ${code}: ${stderr.slice(0, 300)}`);
        resolve({ text: `Claude error (code=${code})`, sessionId: null });
      }
    });

    proc.on("error", err => {
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
  let rem = text;
  while (rem.length > 0) {
    let end = limit;
    if (rem.length > limit) {
      const nl = rem.lastIndexOf("\n", limit);
      if (nl > limit * 0.5) end = nl;
    }
    chunks.push(rem.slice(0, end));
    rem = rem.slice(end);
  }
  return chunks;
}

// ============ Bot ============

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const processing = new Set();

logger.info("Claude Anywhere v2 (Telegram) starting...");

// /new — Pro: clear session; Free: no-op (already single-turn)
bot.onText(/^\/(new|reset)$/, async msg => {
  const pro = await isProMode();
  if (pro) {
    const userId = String(msg.from.id);
    userSessions.delete(userId);
    saveSessions();
    await bot.sendMessage(msg.chat.id, "✅ New conversation started.");
  } else {
    await bot.sendMessage(msg.chat.id,
      "✅ Each message is already a fresh conversation in the free tier.\n" +
      `💡 Want multi-turn sessions? Upgrade to Pro → ${UPGRADE_URL}`
    );
  }
});

// /status
bot.onText(/^\/status$/, async msg => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const pro = await isProMode();

  if (pro) {
    const s = userSessions.get(userId);
    const text = s
      ? `✅ Pro mode active\n\nCurrent session: ${s.sessionId.slice(0, 8)}...\nLast used: ${new Date(s.lastUsed).toLocaleString()}`
      : "✅ Pro mode active\n\nNo active session — next message starts a new one.";
    await bot.sendMessage(chatId, text);
  } else {
    const used = getDailyUsage(userId);
    const remaining = Math.max(0, FREE_DAILY_LIMIT - used);
    await bot.sendMessage(chatId,
      `📊 Free tier\nToday: ${used}/${FREE_DAILY_LIMIT} messages used, ${remaining} remaining\n\n` +
      `💡 Upgrade to Pro → ${UPGRADE_URL} ($5.99/mo)`
    );
  }
});

// /sessions — Pro only
bot.onText(/^\/sessions$/, async msg => {
  const pro = await isProMode();
  if (!pro) {
    await bot.sendMessage(msg.chat.id,
      `📋 Session history is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($5.99/mo)`
    );
    return;
  }
  const sessions = listClaudeSessions(10);
  if (!sessions.length) { await bot.sendMessage(msg.chat.id, "No session history."); return; }
  let text = "Recent 10 sessions:\n\n";
  for (const s of sessions) {
    const date = new Date(s.mtime).toLocaleString();
    const user = s.lastUserMsg || "(no content)";
    const asst = s.lastAssistantMsg ? `\n  🤖 ${s.lastAssistantMsg}` : "";
    text += `${s.id.slice(0, 8)} | ${date}\n  👤 ${user}${asst}\n\n`;
  }
  text += "Use /resume <first 8 chars of id> to resume";
  await bot.sendMessage(msg.chat.id, text);
});

// /resume (no args)
bot.onText(/^\/resume$/, async msg => {
  const pro = await isProMode();
  if (!pro) {
    await bot.sendMessage(msg.chat.id, `🔄 /resume is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($5.99/mo)`);
    return;
  }
  await bot.sendMessage(msg.chat.id, "Usage: /resume <session id prefix>\nUse /sessions to list available sessions.");
});

// /resume <id> — Pro only
bot.onText(/^\/resume\s+(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const pro = await isProMode();
  if (!pro) {
    await bot.sendMessage(chatId, `🔄 /resume is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($5.99/mo)`);
    return;
  }
  const target = match[1].trim();
  const sessions = listClaudeSessions(50);
  const found = sessions.find(s => s.id.startsWith(target));
  if (found) {
    userSessions.set(userId, { sessionId: found.id, lastUsed: Date.now(), label: found.lastUserMsg || "" });
    saveSessions();
    await bot.sendMessage(chatId, `✅ Session resumed: ${found.id.slice(0, 8)}...\n👤 ${found.lastUserMsg || "(no content)"}`);
  } else {
    await bot.sendMessage(chatId, `❌ No session starting with "${target}".\nUse /sessions to list available sessions.`);
  }
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
    await bot.sendMessage(msg.chat.id, `❌ ${result.message}\n\nGet a valid key → ${UPGRADE_URL}`);
  }
});

// /help and /start
async function sendHelp(chatId, pro) {
  if (pro) {
    await bot.sendMessage(chatId,
      "🤖 *Claude Anywhere Pro* — Telegram\n\n" +
      "*Commands:*\n" +
      "/new — New conversation\n" +
      "/status — Session status\n" +
      "/sessions — List session history\n" +
      "/resume <id> — Resume a session\n" +
      "/activate <key> — Activate license\n" +
      "/help — Show this help\n\n" +
      "Send text, images, or files to chat.\n" +
      "Supported: PDF, Excel, CSV, code files, etc.",
      { parse_mode: "Markdown" }
    );
  } else {
    await bot.sendMessage(chatId,
      "🤖 *Claude Anywhere* — Free Tier\n\n" +
      "*Commands:*\n" +
      "/new — Start fresh (already default)\n" +
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
      `💡 Upgrade → ${UPGRADE_URL} ($5.99/mo)`,
      { parse_mode: "Markdown" }
    );
  }
}

bot.onText(/^\/start$/, async msg => { await sendHelp(msg.chat.id, await isProMode()); });
bot.onText(/^\/help$/,  async msg => { await sendHelp(msg.chat.id, await isProMode()); });

// ============ Photo handler ============

bot.on("photo", async msg => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const msgId  = String(msg.message_id);

  if (processing.has(msgId)) return;
  processing.add(msgId);

  try {
    const pro = await isProMode();
    if (!pro) {
      await bot.sendMessage(chatId, `📷 Image analysis is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($5.99/mo)`);
      return;
    }

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const ext = file.file_path.split(".").pop() || "jpg";
    const localPath = join(TMP_DIR, `${randomUUID()}.${ext}`);

    const buf = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
    writeFileSync(localPath, buf);
    logger.info(`Photo saved: [${userId}] ${localPath}`);

    const caption = msg.caption || "请描述这张图片";
    await bot.sendMessage(chatId, "🤔 Analyzing image...");

    const result = await runClaude(caption, userSessions.get(userId)?.sessionId || null, [localPath]);
    if (result.sessionId) {
      userSessions.set(userId, { sessionId: result.sessionId, lastUsed: Date.now(), label: caption.slice(0, 30) });
      saveSessions();
    }
    setTimeout(() => { try { unlinkSync(localPath); } catch {} }, 60_000);

    for (const chunk of splitText(result.text)) await bot.sendMessage(chatId, chunk);
  } catch (err) {
    logger.error("Photo error:", err.message);
    await bot.sendMessage(chatId, "Image processing error: " + err.message);
  } finally {
    processing.delete(msgId);
  }
});

// ============ Document handler ============

bot.on("document", async msg => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const msgId  = String(msg.message_id);

  if (processing.has(msgId)) return;
  processing.add(msgId);

  try {
    const pro = await isProMode();
    if (!pro) {
      await bot.sendMessage(chatId, `📄 File analysis is a Pro feature.\n💡 Upgrade → ${UPGRADE_URL} ($5.99/mo)`);
      return;
    }

    const doc = msg.document;
    const fileName = doc.file_name || "unknown";
    const file = await bot.getFile(doc.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const localPath = join(TMP_DIR, `${randomUUID()}_${fileName}`);

    const buf = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
    writeFileSync(localPath, buf);
    logger.info(`File saved: [${userId}] ${fileName} -> ${localPath}`);

    const caption = msg.caption || `请分析这个文件: ${fileName}`;
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const unsupported = ["mp4","avi","mov","mkv","wmv","flv","webm","mp3","wav","ogg","aac","flac","m4a","zip","rar","7z","tar","gz","exe","dll","so","bin"];
    const imageExts   = ["jpg","jpeg","png","gif","webp","bmp"];

    if (unsupported.includes(ext)) {
      await bot.sendMessage(chatId,
        `❌ .${ext} files are not supported.\n\nSupported: images (jpg/png/gif/webp), PDF, txt, md, csv, json, code files, xlsx/xls/csv`
      );
      try { unlinkSync(localPath); } catch {}
      return;
    }

    await bot.sendMessage(chatId, imageExts.includes(ext) ? "🤔 Analyzing image..." : `📄 Analyzing file: ${fileName}...`);

    const sessionId = userSessions.get(userId)?.sessionId || null;
    let result;
    if (imageExts.includes(ext)) {
      result = await runClaude(caption, sessionId, [localPath]);
    } else {
      result = await runClaude(
        `文件已保存到: ${localPath}\n文件名: ${fileName}\n\n${caption}\n\n（请用 Read 工具读取该文件来分析内容）`,
        sessionId
      );
    }

    if (result.sessionId) {
      userSessions.set(userId, { sessionId: result.sessionId, lastUsed: Date.now(), label: `📄 ${fileName}` });
      saveSessions();
    }
    setTimeout(() => { try { unlinkSync(localPath); } catch {} }, 120_000);

    for (const chunk of splitText(result.text)) await bot.sendMessage(chatId, chunk);
  } catch (err) {
    logger.error("File error:", err.message);
    await bot.sendMessage(chatId, "File processing error: " + err.message);
  } finally {
    processing.delete(msgId);
  }
});

// ============ Text message handler ============

bot.on("text", async msg => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const text   = msg.text?.trim();
  const msgId  = String(msg.message_id);

  if (!text || text.startsWith("/")) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);

  logger.info(`Text: [${userId}] ${text.slice(0, 100)}`);

  try {
    const pro = await isProMode();

    if (pro) {
      // --- Pro mode: multi-turn, no ads ---
      await bot.sendMessage(chatId, "🤔 Thinking...");
      const result = await runClaude(text, userSessions.get(userId)?.sessionId || null);
      if (result.sessionId) {
        userSessions.set(userId, { sessionId: result.sessionId, lastUsed: Date.now(), label: text.slice(0, 30) });
        saveSessions();
      }
      if (!result.text) { await bot.sendMessage(chatId, "No response from Claude. Please try again."); return; }
      for (const chunk of splitText(result.text)) await bot.sendMessage(chatId, chunk);
      logger.info(`Reply: ${result.text.length} chars`);

    } else {
      // --- Free mode: single-turn, quota, ads ---
      if (checkTrialExpired(userId)) {
        await bot.sendMessage(chatId, TRIAL_EXPIRED_MSG);
        return;
      }

      const quota = await checkAndIncrementQuota(userId);
      if (!quota.allowed) {
        await bot.sendMessage(chatId, LIMIT_MSG);
        return;
      }

      await bot.sendMessage(chatId, "🤔 Thinking...");
      // Single-turn: no sessionId passed
      const result = await runClaude(text);
      if (!result.text) { await bot.sendMessage(chatId, "No response from Claude. Please try again."); return; }

      // Append upgrade ad to every reply
      const fullReply = result.text + UPGRADE_AD;
      for (const chunk of splitText(fullReply)) await bot.sendMessage(chatId, chunk);
      logger.info(`Reply (free): ${result.text.length} chars`);
    }

  } catch (err) {
    logger.error("Text error:", err.message);
    if (String(err).includes("session") || String(err).includes("resume")) {
      userSessions.delete(userId);
      saveSessions();
    }
    await bot.sendMessage(chatId, "Error: " + err.message);
  } finally {
    processing.delete(msgId);
  }
});

// ============ Polling error ============

bot.on("polling_error", err => logger.error("Polling error:", err.message));

process.on("SIGINT",  () => { bot.stopPolling(); process.exit(0); });
process.on("SIGTERM", () => { bot.stopPolling(); process.exit(0); });

logger.info("Bot started. Waiting for messages...");
