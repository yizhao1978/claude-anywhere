#!/usr/bin/env node
/**
 * bridge-wecom.mjs — Claude Anywhere Free Tier (WeChat Work)
 *
 * Free tier limits:
 *   - Single-turn conversations (no --resume)
 *   - 5 messages/day per user
 *   - 7-day trial period (from first use, tracked locally)
 *   - Text only (no image/file analysis)
 *   - Chinese upgrade prompt appended to every reply
 *   - Stream timeout handling (WeCom 6-min limit)
 */

import { WSClient } from "@wecom/aibot-node-sdk";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

// ============ Config (all from .env) ============
const BOT_ID  = process.env.WECOM_BOT_ID;
const SECRET  = process.env.WECOM_SECRET;

if (!BOT_ID || !SECRET) {
  console.error("ERROR: WECOM_BOT_ID and WECOM_SECRET must be set in .env");
  process.exit(1);
}

const CLAUDE_PATH        = process.env.CLAUDE_PATH?.trim() || "claude";
const CLAUDE_CWD         = process.env.CLAUDE_CWD?.trim()  || process.cwd();
const CLAUDE_TIMEOUT_MS  = 600_000;
const STREAM_TIMEOUT_MS  = 5 * 60 * 1000;  // 5 min, WeCom limit is 6 min
const MAX_REPLY_LENGTH   = 4000;
const FREE_DAILY_LIMIT   = 5;
const TRIAL_DAYS         = 7;

// Chinese upgrade prompts
const UPGRADE_AD       = "\n\n💡 升级Pro版：无限对话、多轮会话、图片文件分析 → 联系微信获取激活码（¥35.9/月）";
const LIMIT_MSG        = "⚠️ 今日免费额度已用完（5/5）。升级Pro版 → 联系微信获取激活码（¥35.9/月）";
const TRIAL_EXPIRED    = "⚠️ 免费试用已到期（7天）。升级Pro版 → 联系微信获取激活码（¥35.9/月）";
// ================================================

const STATE_DIR  = join(homedir(), ".claude-anywhere-free");
const STATE_FILE = join(STATE_DIR, "wecom-state.json");
mkdirSync(STATE_DIR, { recursive: true });

const logger = {
  info:  (...a) => console.log(new Date().toISOString(), "[INFO]",  ...a),
  warn:  (...a) => console.warn(new Date().toISOString(), "[WARN]",  ...a),
  error: (...a) => console.error(new Date().toISOString(), "[ERROR]", ...a),
};

// ============ Persistent state (daily counts + trial tracking) ============
// { users: { [userId]: { firstUsed: ISO, daily: { [date]: count } } } }

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return { users: {} };
}

function saveState(state) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    logger.warn("Failed to save state:", e.message);
  }
}

let appState = loadState();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check and increment quota.
 * Returns { allowed: bool, reason: null | "daily_limit" | "trial_expired" }
 */
function checkAndIncrementQuota(userId) {
  const today = todayStr();
  const users  = appState.users;

  if (!users[userId]) {
    users[userId] = { firstUsed: today, daily: {} };
    saveState(appState);
  }

  const user = users[userId];

  // Check trial period
  const firstDate = new Date(user.firstUsed);
  const nowDate   = new Date(today);
  const daysDiff  = Math.floor((nowDate - firstDate) / 86400000);
  if (daysDiff >= TRIAL_DAYS) {
    return { allowed: false, reason: "trial_expired" };
  }

  // Check daily limit
  const used = user.daily[today] || 0;
  if (used >= FREE_DAILY_LIMIT) {
    return { allowed: false, reason: "daily_limit" };
  }

  // Increment and save
  user.daily[today] = used + 1;
  saveState(appState);
  return { allowed: true, reason: null };
}

// ============ runClaude (single-turn) ============

function runClaude(message) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", message,
      "--max-turns", "100",
      "--output-format", "json",
      "--dangerously-skip-permissions",
      // No --resume (single-turn free tier)
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

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => {
      if (stderr.length < 1000) stderr += chunk.toString();
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
        resolve(`Claude 执行出错 (code=${code})`);
      }
    });

    proc.on("error", (err) => {
      proc.stdout.removeAllListeners();
      proc.stderr.removeAllListeners();
      proc.removeAllListeners();
      reject(new Error(`Claude 启动失败: ${err.message}`));
    });

    proc.stdin.end();
  });
}

// ============ Helpers ============

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

async function safeReplyStream(wsClient, frame, streamId, content, isFinish) {
  try {
    await wsClient.replyStream(frame, streamId, content, isFinish);
    return true;
  } catch (err) {
    if (err?.errcode === 846608 || String(err).includes("846608")) {
      logger.warn(`Stream expired: ${streamId}`);
      return false;
    }
    throw err;
  }
}

async function sendResult(wsClient, frame, streamId, streamExpired, text) {
  const chunks = splitText(text);
  const sid = streamExpired
    ? `stream_${Date.now()}_${randomUUID().slice(0, 8)}`
    : streamId;

  if (streamExpired) logger.info(`Using new stream: ${sid}`);

  if (chunks.length === 1) {
    await safeReplyStream(wsClient, frame, sid, chunks[0], true);
  } else {
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const prefix = !isLast ? `[${i + 1}/${chunks.length}]\n` : "";
      await safeReplyStream(wsClient, frame, sid, prefix + chunks[i], isLast);
    }
  }
}

// ============ Command handling ============

function parseCommand(text) {
  if (!text) return null;
  if (text === "/new" || text === "/reset" || text === "新对话") return { cmd: "new" };
  if (text === "/status") return { cmd: "status" };
  if (text === "/help") return { cmd: "help" };
  const activateMatch = text.match(/^\/activate(?:\s+(.+))?$/);
  if (activateMatch) return { cmd: "activate", key: activateMatch[1]?.trim() };
  // Unsupported Pro commands
  if (text === "/sessions" || text.startsWith("/resume")) return { cmd: "pro_only" };
  return null;
}

async function handleCommand(wsClient, frame, userId, command) {
  const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;

  switch (command.cmd) {
    case "new":
      // No-op in free tier — every message is already single-turn
      await wsClient.replyStream(frame, streamId,
        "✅ 每条消息默认就是独立对话（免费版）。\n💡 升级Pro版可获得多轮会话 → 联系微信获取激活码（¥35.9/月）",
        true
      );
      break;

    case "status": {
      const user  = appState.users[userId];
      const today = todayStr();
      if (!user) {
        await wsClient.replyStream(frame, streamId,
          `📊 免费试用版\n今日：0/${FREE_DAILY_LIMIT} 条\n剩余试用：${TRIAL_DAYS} 天\n\n💡 升级Pro版 → 联系微信获取激活码（¥35.9/月）`,
          true
        );
        break;
      }
      const used      = user.daily[today] || 0;
      const remaining = Math.max(0, FREE_DAILY_LIMIT - used);
      const daysDiff  = Math.floor((new Date(today) - new Date(user.firstUsed)) / 86400000);
      const trialLeft = Math.max(0, TRIAL_DAYS - daysDiff);
      await wsClient.replyStream(frame, streamId,
        `📊 免费试用版\n今日：${used}/${FREE_DAILY_LIMIT} 条，剩余 ${remaining} 条\n剩余试用天数：${trialLeft} 天\n\n💡 升级Pro版 → 联系微信获取激活码（¥35.9/月）`,
        true
      );
      break;
    }

    case "help":
      await wsClient.replyStream(frame, streamId,
        "🤖 Claude Anywhere 免费版\n\n" +
        "命令：\n" +
        "/new — 新建对话（默认已是单轮）\n" +
        "/status — 查看今日用量和试用期\n" +
        "/activate <key> — 激活Pro授权码\n" +
        "/help — 显示帮助\n\n" +
        "免费版限制：\n" +
        "• 每日5条\n" +
        "• 7天试用期\n" +
        "• 单轮对话（不续接）\n" +
        "• 仅支持文字\n\n" +
        "💡 升级Pro版：无限对话、多轮会话、图片文件分析 → 联系微信获取激活码（¥35.9/月）",
        true
      );
      break;

    case "activate": {
      if (!command.key) {
        await wsClient.replyStream(frame, streamId,
          "用法：/activate <激活码>\n\n购买Pro版 → 联系微信获取激活码（¥35.9/月）",
          true
        );
        break;
      }
      // Activation not yet integrated — guide user
      await wsClient.replyStream(frame, streamId,
        `🔑 请将激活码 ${command.key} 发送给开发者确认，或在 .env 中设置 LICENSE_KEY 后重启服务。`,
        true
      );
      break;
    }

    case "pro_only":
      await wsClient.replyStream(frame, streamId,
        "⚠️ /sessions 和 /resume 是Pro版功能。\n💡 升级Pro版 → 联系微信获取激活码（¥35.9/月）",
        true
      );
      break;
  }
}

// ============ Dedup ============
const processing = new Set();

// ============ Text message handler ============

async function handleTextMessage(wsClient, frame) {
  const msgId    = frame.body?.msgid;
  const userId   = frame.body?.from?.userid || "default";
  const text     = frame.body?.text?.content?.trim();

  if (!text || !msgId) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);

  logger.info(`Message from [${userId}]: ${text.slice(0, 100)}`);

  try {
    const command = parseCommand(text);
    if (command) {
      await handleCommand(wsClient, frame, userId, command);
      return;
    }

    // Gate: image/file content passed as text path patterns
    if (text.startsWith("/tmp/") || text.startsWith("图片文件:") || text.startsWith("文件已保存到:")) {
      const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await wsClient.replyStream(frame, streamId,
        "⚠️ 图片/文件分析是Pro版功能。\n💡 升级Pro版 → 联系微信获取激活码（¥35.9/月）",
        true
      );
      return;
    }

    // Check quota
    const quota = checkAndIncrementQuota(userId);
    if (!quota.allowed) {
      const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      const msg = quota.reason === "trial_expired" ? TRIAL_EXPIRED : LIMIT_MSG;
      await wsClient.replyStream(frame, streamId, msg, true);
      return;
    }

    // Call Claude with stream timeout handling
    const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await wsClient.replyStream(frame, streamId, "<think>正在思考...</think>", false);

    let streamExpired = false;
    const streamTimer = setTimeout(async () => {
      streamExpired = true;
      logger.warn("Stream approaching timeout, closing early");
      await safeReplyStream(wsClient, frame, streamId, "⏳ 处理时间较长，完成后将发送新消息...", true);
    }, STREAM_TIMEOUT_MS);

    let reply;
    try {
      reply = await runClaude(text);
    } finally {
      clearTimeout(streamTimer);
    }

    if (!reply) {
      const sid = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await safeReplyStream(wsClient, frame, sid, "Claude 没有返回结果，请重试。", true);
      return;
    }

    // Append upgrade ad to every reply
    const fullReply = reply + UPGRADE_AD;
    await sendResult(wsClient, frame, streamId, streamExpired, fullReply);
    logger.info(`Reply sent: ${reply.length} chars`);

  } catch (err) {
    logger.error("Error processing message:", err.message);
    try {
      const errId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await safeReplyStream(wsClient, frame, errId, `处理出错: ${err.message}`, true);
    } catch {}
  } finally {
    processing.delete(msgId);
  }
}

// ============ Image/File handlers — Pro gate ============

async function handleImageMessage(wsClient, frame) {
  const msgId = frame.body?.msgid;
  if (!msgId) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);
  try {
    const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await wsClient.replyStream(frame, streamId,
      "📷 图片分析是Pro版功能。\n💡 升级Pro版 → 联系微信获取激活码（¥35.9/月）",
      true
    );
  } finally {
    processing.delete(msgId);
  }
}

async function handleFileMessage(wsClient, frame) {
  const msgId = frame.body?.msgid;
  if (!msgId) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);
  try {
    const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await wsClient.replyStream(frame, streamId,
      "📄 文件分析是Pro版功能。\n💡 升级Pro版 → 联系微信获取激活码（¥35.9/月）",
      true
    );
  } finally {
    processing.delete(msgId);
  }
}

// ============ Start ============

function start() {
  logger.info("Claude Anywhere (free tier, WeChat Work) starting...");

  const wsClient = new WSClient({
    botId:                BOT_ID,
    secret:               SECRET,
    logger,
    heartbeatInterval:    30_000,
    maxReconnectAttempts: -1,
    reconnectInterval:    3000,
    requestTimeout:       15_000,
  });

  wsClient.on("connected",      () => logger.info("WebSocket connected"));
  wsClient.on("authenticated",  () => logger.info("Authenticated, waiting for messages..."));
  wsClient.on("disconnected",   (r) => logger.warn("Disconnected:", r));
  wsClient.on("error",          (e) => logger.error("WebSocket error:", e.message));

  wsClient.on("message.text", (frame) => {
    handleTextMessage(wsClient, frame).catch((e) =>
      logger.error("Text handler error:", e.message)
    );
  });

  wsClient.on("message.image", (frame) => {
    handleImageMessage(wsClient, frame).catch((e) =>
      logger.error("Image handler error:", e.message)
    );
  });

  wsClient.on("message.file", (frame) => {
    handleFileMessage(wsClient, frame).catch((e) =>
      logger.error("File handler error:", e.message)
    );
  });

  wsClient.on("event.enter_chat", async (frame) => {
    try {
      await wsClient.replyWelcome(frame, {
        msgtype: "text",
        text: { content: "Claude Code 助手已就绪（免费版）。\n发文字即可对话。/status 查看用量 | /help 帮助" },
      });
    } catch (e) {
      logger.warn("Welcome message failed:", e.message);
    }
  });

  wsClient.connect();

  process.on("SIGINT",  () => { wsClient.disconnect(); process.exit(0); });
  process.on("SIGTERM", () => { wsClient.disconnect(); process.exit(0); });
}

start();
