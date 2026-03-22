#!/usr/bin/env node
/**
 * bridge-wecom.mjs — Claude Anywhere v2 (WeChat Work)
 *
 * Unified Free + Pro bridge. Mode determined by LICENSE_KEY at startup:
 *   - LICENSE_KEY set + server validates → Pro mode (full features, no ads)
 *   - No key or validation fails         → Free mode (5/day, 7-day trial, ads)
 *
 * All config from .env — no hardcoded credentials.
 * Preserves WeCom-specific: 6-min stream timeout, wsClient.downloadFile() for images/files.
 */

import { WSClient } from "@wecom/aibot-node-sdk";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import {
  writeFileSync, readFileSync, existsSync, mkdirSync,
  unlinkSync, readdirSync, statSync,
} from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { getLicenseTier, activateLicense } from "./license-client.mjs";

// Load .env if present
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
const BOT_ID  = process.env.WECOM_BOT_ID;
const SECRET  = process.env.WECOM_SECRET;

if (!BOT_ID || !SECRET) {
  console.error("ERROR: WECOM_BOT_ID and WECOM_SECRET must be set in .env");
  process.exit(1);
}

const CLAUDE_PATH       = process.env.CLAUDE_PATH?.trim() || "claude";
const CLAUDE_CWD        = process.env.CLAUDE_CWD?.trim()  || process.cwd();
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || "600000", 10);
const MAX_REPLY_LENGTH  = parseInt(process.env.MAX_REPLY_LENGTH  || "4000",   10);
const STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — WeCom limit is 6 min
const MAX_STDERR_LEN    = 1000;
const TMP_DIR           = "/tmp/claude-anywhere-wecom";

// Sessions file (Pro mode)
const SESSIONS_FILE = join(homedir(), ".claude-anywhere", "wecom-sessions.json");

// Free tier constants (Chinese)
const FREE_DAILY_LIMIT  = 5;
const TRIAL_DAYS        = 7;
const UPGRADE_AD        = "\n\n💡 升级Pro版：无限对话、多轮会话、图片文件分析 → 联系 support@claudeanywhere.com（¥35.9/月）";
const LIMIT_MSG         = "⚠️ 今日免费额度已用完（5/5）。升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）";
const TRIAL_EXPIRED_MSG = "⚠️ 免费试用已到期（7天）。升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）";

// Free tier state dir
const STATE_DIR  = join(homedir(), ".claude-anywhere-free");
const STATE_FILE = join(STATE_DIR, "wecom-state.json");
// ================================================

mkdirSync(TMP_DIR, { recursive: true });
mkdirSync(join(homedir(), ".claude-anywhere"), { recursive: true });
mkdirSync(STATE_DIR, { recursive: true });

const logger = {
  info:  (...a) => console.log( new Date().toISOString(), "[INFO]",  ...a),
  warn:  (...a) => console.warn( new Date().toISOString(), "[WARN]",  ...a),
  error: (...a) => console.error(new Date().toISOString(), "[ERROR]", ...a),
  debug: () => {},
};

// ============ License check ============

let _proMode = null;

async function isProMode() {
  _proMode = null;
  const tier = await getLicenseTier();
  _proMode = (tier === "pro");
  return _proMode;
}

// ============ Free tier: persistent state ============
// { users: { [userId]: { firstUsed: "YYYY-MM-DD", daily: { [date]: count } } } }

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {}
  return { users: {} };
}

function saveState(state) {
  try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) {
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
  const users = appState.users;

  if (!users[userId]) {
    users[userId] = { firstUsed: today, daily: {} };
    saveState(appState);
  }

  const user = users[userId];

  // Check trial period
  const daysDiff = Math.floor((new Date(today) - new Date(user.firstUsed)) / 86400000);
  if (daysDiff >= TRIAL_DAYS) return { allowed: false, reason: "trial_expired" };

  // Check daily limit
  const used = user.daily[today] || 0;
  if (used >= FREE_DAILY_LIMIT) return { allowed: false, reason: "daily_limit" };

  user.daily[today] = used + 1;
  saveState(appState);
  return { allowed: true, reason: null };
}

function getStatusText(userId) {
  const today = todayStr();
  const user  = appState.users[userId];
  if (!user) {
    return `📊 免费试用版\n今日：0/${FREE_DAILY_LIMIT} 条\n剩余试用：${TRIAL_DAYS} 天\n\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）`;
  }
  const used      = user.daily[today] || 0;
  const remaining = Math.max(0, FREE_DAILY_LIMIT - used);
  const daysDiff  = Math.floor((new Date(today) - new Date(user.firstUsed)) / 86400000);
  const trialLeft = Math.max(0, TRIAL_DAYS - daysDiff);
  return `📊 免费试用版\n今日：${used}/${FREE_DAILY_LIMIT} 条，剩余 ${remaining} 条\n剩余试用天数：${trialLeft} 天\n\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）`;
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

function getSessionId(senderId) {
  return userSessions.get(senderId)?.sessionId || null;
}

function updateSession(senderId, sessionId, label) {
  if (sessionId) {
    userSessions.set(senderId, { sessionId, lastUsed: Date.now(), label: label || "" });
    saveSessions();
    logger.info(`Session updated: [${senderId}] -> ${sessionId.slice(0, 8)}...`);
  }
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
  if (t.startsWith("图片文件:") || t.startsWith("/tmp/") || t.startsWith("文件已保存到:")) return false;
  if (t.startsWith("最近") && t.includes("个会话")) return false;
  if (t.length < 2) return false;
  return true;
}

function listClaudeSessions(limit = 10) {
  const dirs = getSessionsDirs();
  const all  = [];

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

function runClaude(message, sessionId = null) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p", message,
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
        resolve({ text: `Claude 执行出错 (code=${code})`, sessionId: null });
      }
    });

    proc.on("error", err => {
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

// ============ Command parsing ============

function parseCommand(text) {
  if (!text) return null;
  if (text === "/new" || text === "/reset" || text === "新对话") return { cmd: "new" };
  if (text === "/status")   return { cmd: "status" };
  if (text === "/sessions") return { cmd: "sessions" };
  if (text === "/resume")   return { cmd: "resume_help" };
  if (text === "/help")     return { cmd: "help" };
  const resumeM = text.match(/^\/resume\s+(.+)$/);
  if (resumeM) return { cmd: "resume", id: resumeM[1].trim() };
  const activateM = text.match(/^\/activate(?:\s+(.+))?$/);
  if (activateM) return { cmd: "activate", key: activateM[1]?.trim() };
  return null;
}

// ============ Command handler ============

async function handleCommand(wsClient, frame, senderId, command, pro) {
  const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;

  switch (command.cmd) {
    case "new":
      if (pro) {
        userSessions.delete(senderId);
        saveSessions();
        await wsClient.replyStream(frame, streamId, "✅ 已开始新对话。", true);
      } else {
        await wsClient.replyStream(frame, streamId,
          "✅ 每条消息默认就是独立对话（免费版）。\n💡 升级Pro版可获得多轮会话 → 联系 support@claudeanywhere.com（¥35.9/月）",
          true
        );
      }
      break;

    case "status": {
      let text;
      if (pro) {
        const s = userSessions.get(senderId);
        text = s
          ? `✅ Pro版已激活\n\n当前会话: ${s.sessionId.slice(0, 8)}...\n上次使用: ${new Date(s.lastUsed).toLocaleString("zh-CN")}`
          : "✅ Pro版已激活\n\n无活跃会话，下条消息将开始新对话。";
      } else {
        text = getStatusText(senderId);
      }
      await wsClient.replyStream(frame, streamId, text, true);
      break;
    }

    case "sessions":
      if (!pro) {
        await wsClient.replyStream(frame, streamId,
          "⚠️ /sessions 是Pro版功能。\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）",
          true
        );
        break;
      }
      {
        const sessions = listClaudeSessions(10);
        if (!sessions.length) { await wsClient.replyStream(frame, streamId, "没有历史会话。", true); break; }
        let text = "最近10个会话:\n\n";
        for (const s of sessions) {
          const date = new Date(s.mtime).toLocaleString("zh-CN");
          const user = s.lastUserMsg || "无内容";
          const asst = s.lastAssistantMsg ? `\n  🤖 ${s.lastAssistantMsg}` : "";
          text += `${s.id.slice(0, 8)} | ${date}\n  👤 ${user}${asst}\n\n`;
        }
        text += "用 /resume <id前8位> 恢复会话";
        await wsClient.replyStream(frame, streamId, text, true);
      }
      break;

    case "resume_help":
      if (!pro) {
        await wsClient.replyStream(frame, streamId,
          "⚠️ /resume 是Pro版功能。\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）",
          true
        );
        break;
      }
      await wsClient.replyStream(frame, streamId, "用法: /resume <会话ID前几位>\n先用 /sessions 查看可用会话。", true);
      break;

    case "resume": {
      if (!pro) {
        await wsClient.replyStream(frame, streamId,
          "⚠️ /resume 是Pro版功能。\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）",
          true
        );
        break;
      }
      const sessions = listClaudeSessions(50);
      const found = sessions.find(s => s.id.startsWith(command.id));
      if (found) {
        userSessions.set(senderId, { sessionId: found.id, lastUsed: Date.now(), label: found.lastUserMsg || "" });
        saveSessions();
        await wsClient.replyStream(frame, streamId, `✅ 已恢复会话: ${found.id.slice(0, 8)}...\n👤 ${found.lastUserMsg || "无内容"}`, true);
      } else {
        await wsClient.replyStream(frame, streamId, `❌ 未找到以 "${command.id}" 开头的会话。\n用 /sessions 查看可用会话。`, true);
      }
      break;
    }

    case "activate": {
      if (!command.key) {
        await wsClient.replyStream(frame, streamId,
          "用法：/activate <激活码>\n\n购买Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）",
          true
        );
        break;
      }
      await wsClient.replyStream(frame, streamId, "🔑 正在验证激活码...", false);
      const result = await activateLicense(command.key);
      await wsClient.replyStream(frame, `stream_${Date.now()}_${randomUUID().slice(0, 8)}`,
        result.success
          ? `✅ ${result.message}\n\n请在 .env 中设置 LICENSE_KEY=${command.key} 并重启服务。`
          : `❌ ${result.message}\n\n购买Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）`,
        true
      );
      break;
    }

    case "help":
      if (pro) {
        await wsClient.replyStream(frame, streamId,
          "🤖 Claude Anywhere Pro — 企业微信\n\n" +
          "/new    — 新建对话\n" +
          "/status — 当前会话状态\n" +
          "/sessions — 列出历史会话\n" +
          "/resume <id> — 恢复指定会话\n" +
          "/activate <key> — 激活授权码\n" +
          "/help   — 显示帮助\n\n" +
          "直接发文字、图片或文件即可对话。\n支持: PDF、Excel、CSV、代码文件等。",
          true
        );
      } else {
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
          "💡 升级Pro版：无限对话、多轮会话、图片文件分析 → 联系 support@claudeanywhere.com（¥35.9/月）",
          true
        );
      }
      break;
  }
}

// ============ Core Claude call (with 6-min stream timeout) ============

async function handleClaudeCall(wsClient, frame, senderId, message, label, pro) {
  const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;

  try {
    await wsClient.replyStream(frame, streamId, "<think>正在思考...</think>", false);

    const currentSessionId = pro ? getSessionId(senderId) : null;
    let streamExpired = false;

    const streamTimer = setTimeout(async () => {
      streamExpired = true;
      logger.warn("Stream timeout approaching, closing current stream");
      await safeReplyStream(wsClient, frame, streamId, "⏳ 处理时间较长，完成后将发送新消息...", true);
    }, STREAM_TIMEOUT_MS);

    const result = await runClaude(message, currentSessionId);
    clearTimeout(streamTimer);

    if (pro) updateSession(senderId, result.sessionId, label);

    if (!result.text) {
      if (!streamExpired) await safeReplyStream(wsClient, frame, streamId, "Claude 没有返回结果，请重试。", true);
      return;
    }

    // In free mode, append upgrade ad
    const finalText = pro ? result.text : result.text + UPGRADE_AD;
    await sendResult(wsClient, frame, streamId, streamExpired, finalText);
    logger.info(`Reply (${pro ? "pro" : "free"}): ${result.text.length} chars`);

  } catch (err) {
    logger.error(`Error: ${err?.message || err}`);
    if (String(err).includes("session") || String(err).includes("resume")) {
      userSessions.delete(senderId);
      saveSessions();
    }
    try {
      const errId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await safeReplyStream(wsClient, frame, errId, `处理出错: ${err?.message || err}`, true);
    } catch {}
  }
}

const processing = new Set();

// ============ Text message handler ============

async function handleTextMessage(wsClient, frame) {
  const msgId    = frame.body?.msgid;
  const senderId = frame.body?.from?.userid || "default";
  const text     = frame.body?.text?.content?.trim();

  if (!text || !msgId) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);

  logger.info(`Text: [${senderId}] ${text.slice(0, 100)}`);

  try {
    const pro = await isProMode();
    const command = parseCommand(text);
    if (command) {
      await handleCommand(wsClient, frame, senderId, command, pro);
      return;
    }

    if (!pro) {
      const quota = checkAndIncrementQuota(senderId);
      if (!quota.allowed) {
        const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
        const msg = quota.reason === "trial_expired" ? TRIAL_EXPIRED_MSG : LIMIT_MSG;
        await wsClient.replyStream(frame, streamId, msg, true);
        return;
      }
    }

    await handleClaudeCall(wsClient, frame, senderId, text, text.slice(0, 30), pro);
  } finally {
    processing.delete(msgId);
  }
}

// ============ Image handler ============

async function handleImageMessage(wsClient, frame) {
  const msgId    = frame.body?.msgid;
  const senderId = frame.body?.from?.userid || "default";
  const image    = frame.body?.image;

  if (!image?.url || !msgId) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);

  logger.info(`Image: [${senderId}]`);

  try {
    const pro = await isProMode();
    if (!pro) {
      const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await wsClient.replyStream(frame, streamId,
        "📷 图片分析是Pro版功能。\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）",
        true
      );
      return;
    }

    // Download and decrypt image using wsClient
    const { buffer, filename } = await wsClient.downloadFile(image.url, image.aeskey);
    const ext = (filename || "image.jpg").split(".").pop() || "jpg";
    const localPath = join(TMP_DIR, `${randomUUID()}.${ext}`);
    writeFileSync(localPath, buffer);
    logger.info(`Image saved: ${localPath}`);

    const message = `图片文件: ${localPath}\n\n请描述这张图片\n\n（请用 Read 工具读取上述图片文件来查看图片内容）`;
    await handleClaudeCall(wsClient, frame, senderId, message, "📷 图片", pro);
    setTimeout(() => { try { unlinkSync(localPath); } catch {} }, 60_000);

  } catch (err) {
    logger.error("Image error:", err?.message || err);
    try {
      const sid = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await safeReplyStream(wsClient, frame, sid, `图片处理出错: ${err?.message || err}`, true);
    } catch {}
  } finally {
    processing.delete(msgId);
  }
}

// ============ File handler ============

async function handleFileMessage(wsClient, frame) {
  const msgId    = frame.body?.msgid;
  const senderId = frame.body?.from?.userid || "default";
  const file     = frame.body?.file;

  if (!file?.url || !msgId) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);

  const fileName = file.filename || "unknown";
  logger.info(`File: [${senderId}] ${fileName}`);

  try {
    const pro = await isProMode();
    if (!pro) {
      const streamId = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await wsClient.replyStream(frame, streamId,
        "📄 文件分析是Pro版功能。\n💡 升级Pro版 → 联系 support@claudeanywhere.com（¥35.9/月）",
        true
      );
      return;
    }

    // Download and decrypt file using wsClient
    const { buffer, filename } = await wsClient.downloadFile(file.url, file.aeskey);
    const actualName = filename || fileName;
    const localPath  = join(TMP_DIR, `${randomUUID()}_${actualName}`);
    writeFileSync(localPath, buffer);
    logger.info(`File saved: ${localPath}`);

    const ext = actualName.split(".").pop()?.toLowerCase() || "";
    const unsupported = ["mp4","avi","mov","mkv","mp3","wav","ogg","zip","rar","7z","tar","gz","exe","dll","bin"];
    const imageExts   = ["jpg","jpeg","png","gif","webp","bmp"];

    if (unsupported.includes(ext)) {
      const sid = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await wsClient.replyStream(frame, sid, `❌ 不支持分析 .${ext} 文件。\n\n支持: 图片/PDF/TXT/CSV/Excel/代码文件等`, true);
      try { unlinkSync(localPath); } catch {}
      return;
    }

    const message = imageExts.includes(ext)
      ? `图片文件: ${localPath}\n\n请描述这张图片\n\n（请用 Read 工具读取上述图片文件来查看图片内容）`
      : `文件已保存到: ${localPath}\n文件名: ${actualName}\n\n请分析这个文件\n\n（请用 Read 工具读取该文件来分析内容）`;

    await handleClaudeCall(wsClient, frame, senderId, message, `📄 ${actualName}`, pro);
    setTimeout(() => { try { unlinkSync(localPath); } catch {} }, 120_000);

  } catch (err) {
    logger.error("File error:", err?.message || err);
    try {
      const sid = `stream_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await safeReplyStream(wsClient, frame, sid, `文件处理出错: ${err?.message || err}`, true);
    } catch {}
  } finally {
    processing.delete(msgId);
  }
}

// ============ Start ============

async function start() {
  const pro = await isProMode();
  logger.info(`Claude Anywhere v2 (WeChat Work) — ${pro ? "Pro" : "Free"} mode`);

  const wsClient = new WSClient({
    botId:                BOT_ID,
    secret:               SECRET,
    logger,
    heartbeatInterval:    30_000,
    maxReconnectAttempts: -1,
    reconnectInterval:    3000,
    requestTimeout:       15_000,
  });

  wsClient.on("connected",     () => logger.info("WebSocket connected"));
  wsClient.on("authenticated", () => logger.info("Authenticated, waiting for messages..."));
  wsClient.on("disconnected",  reason => logger.warn("Disconnected:", reason));
  wsClient.on("error",         err    => logger.error("WebSocket error:", err?.message || err));

  wsClient.on("message.text",  frame => handleTextMessage(wsClient, frame).catch(e  => logger.error("Text handler:", e?.message)));
  wsClient.on("message.image", frame => handleImageMessage(wsClient, frame).catch(e => logger.error("Image handler:", e?.message)));
  wsClient.on("message.file",  frame => handleFileMessage(wsClient, frame).catch(e  => logger.error("File handler:", e?.message)));

  wsClient.on("event.enter_chat", async frame => {
    try {
      const welcome = pro
        ? "Claude Anywhere Pro 已就绪。\n/new 新对话 | /sessions 历史 | /help 帮助"
        : "Claude Code 助手已就绪（免费版）。\n发文字即可对话。/status 查看用量 | /help 帮助";
      await wsClient.replyWelcome(frame, { msgtype: "text", text: { content: welcome } });
    } catch (e) {
      logger.warn("Welcome message failed:", e?.message);
    }
  });

  wsClient.connect();

  process.on("SIGINT",  () => { wsClient.disconnect(); process.exit(0); });
  process.on("SIGTERM", () => { wsClient.disconnect(); process.exit(0); });
}

start();
