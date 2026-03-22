#!/usr/bin/env node
/**
 * bridge-qq.mjs — Claude Anywhere QQ Bot Bridge (thin shell)
 *
 * Uses QQ Bot official HTTP API (webhook mode).
 * All business logic lives in core.mjs.
 *
 * QQ Bot limitations:
 *   - Cannot proactively push messages (only reply within interaction window)
 *   - /cron creation warns user about no push support
 */

import { createServer } from "http";
import { randomUUID } from "crypto";
import {
  writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync,
} from "fs";
import { join } from "path";
import { ClaudeAnywhere } from "./core.mjs";

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

// ============ Config ============
const QQ_APP_ID     = process.env.QQ_APP_ID;
const QQ_APP_SECRET = process.env.QQ_APP_SECRET;
const QQ_PORT       = parseInt(process.env.QQ_WEBHOOK_PORT || "9701", 10);

if (!QQ_APP_ID || !QQ_APP_SECRET) {
  console.error("ERROR: QQ_APP_ID and QQ_APP_SECRET must be set in .env");
  process.exit(1);
}

const TMP_DIR = "/tmp/claude-anywhere-qq";
mkdirSync(TMP_DIR, { recursive: true });

// ============ Core instance ============
const core = new ClaudeAnywhere({ platform: "qq" });

// QQ does not support proactive push — cron results cannot be delivered
core.setCronResultHandler(async (jobId, jobName, userId, result) => {
  core.logger.warn(`QQ does not support proactive push. Cron result for job "${jobName}" (user ${userId}) cannot be delivered.`);
});

// ============ QQ API helpers ============

let _accessToken = null;
let _tokenExpiry  = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken;

  try {
    const res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: QQ_APP_ID, clientSecret: QQ_APP_SECRET }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (data.access_token) {
      _accessToken = data.access_token;
      _tokenExpiry = Date.now() + (parseInt(data.expires_in, 10) || 7200) * 1000;
      core.logger.info("QQ access token refreshed");
      return _accessToken;
    }
    core.logger.error("Failed to get QQ access token:", JSON.stringify(data));
    return null;
  } catch (e) {
    core.logger.error("QQ token request failed:", e.message);
    return null;
  }
}

const QQ_API_BASE = "https://api.sgroup.qq.com";

async function qqApi(method, path, body) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${QQ_API_BASE}${path}`, {
      method,
      headers: {
        "Authorization": `QQBot ${token}`,
        "Content-Type": "application/json",
        "X-Union-Appid": QQ_APP_ID,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text();
      core.logger.error(`QQ API ${method} ${path} ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    core.logger.error(`QQ API error: ${e.message}`);
    return null;
  }
}

/**
 * Reply to a C2C (private) message.
 */
async function replyC2C(openid, msgId, content) {
  const chunks = core.splitText(content);
  for (const chunk of chunks) {
    await qqApi("POST", `/v2/users/${openid}/messages`, {
      content: chunk,
      msg_type: 0,
      msg_id: msgId,
    });
  }
}

/**
 * Reply to a group message.
 */
async function replyGroup(groupOpenid, msgId, content) {
  const chunks = core.splitText(content);
  for (const chunk of chunks) {
    await qqApi("POST", `/v2/groups/${groupOpenid}/messages`, {
      content: chunk,
      msg_type: 0,
      msg_id: msgId,
    });
  }
}

// ============ Message handling ============

async function handleMessage(userId, text, replyFn) {
  if (!text?.trim()) return;
  text = text.trim();

  const msgId = `qq_${userId}_${Date.now()}`;
  if (core.isProcessing(msgId)) return;

  core.logger.info(`Text: [${userId}] ${text.slice(0, 100)}`);

  try {
    // Check for pending cron confirmation
    if (core.hasPendingCron(userId)) {
      const cronResult = core.handleCronConfirmation(userId, text);
      if (cronResult.handled) {
        if (cronResult.reply) await replyFn(cronResult.reply);
        return;
      }
    }

    const pro = await core.isProMode();
    const command = core.parseCommand(text);

    if (command) {
      const result = await core.handleCommand(userId, command, pro);
      for (const reply of result.replies) {
        await replyFn(reply);
      }
      return;
    }

    // Free tier quota check
    if (!pro) {
      const quota = core.checkQuota(userId);
      if (!quota.allowed) {
        const msg = quota.reason === "trial_expired" ? core.T.trialExpired : core.T.limitMsg;
        await replyFn(msg);
        return;
      }
    }

    // Claude call
    await replyFn(core.T.thinking);
    const sessionId = pro ? core.getSessionId(userId) : null;
    const result = await core.runClaude(text, sessionId);

    if (pro && result.sessionId) core.updateSession(userId, result.sessionId, text.slice(0, 30));

    if (!result.text) {
      await replyFn(core.T.noResponse);
      return;
    }

    const finalText = pro ? result.text : result.text + core.T.upgradeAd;
    await replyFn(finalText);
    core.logger.info(`Reply (${pro ? "pro" : "free"}): ${result.text.length} chars`);

  } catch (err) {
    core.logger.error("Message error:", err?.message || err);
    if (String(err).includes("session") || String(err).includes("resume")) {
      core.deleteSession(userId);
    }
    try { await replyFn(`处理出错: ${err?.message || err}`); } catch {}
  } finally {
    core.doneProcessing(msgId);
  }
}

// ============ Webhook server ============

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  try {
    const payload = JSON.parse(body);

    // QQ webhook validation (URL verification)
    if (payload.op === 13) {
      const eventBody = typeof payload.d === "string" ? JSON.parse(payload.d) : payload.d;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ plain_token: eventBody.plain_token, signature: "" }));

      // For proper signature verification, we'd need ed25519.
      // For now, echo back the plain_token (works for initial setup).
      core.logger.info("Webhook validation request received");
      return;
    }

    res.writeHead(200);
    res.end("OK");

    // Process events asynchronously
    const eventType = payload.t;
    const data = typeof payload.d === "string" ? JSON.parse(payload.d) : payload.d;

    if (!data) return;

    // C2C (private) message
    if (eventType === "C2C_MESSAGE_CREATE") {
      const openid = data.author?.user_openid;
      const msgId  = data.id;
      const text   = data.content?.trim();
      if (!openid || !text) return;

      await handleMessage(openid, text, (content) => replyC2C(openid, msgId, content));
      return;
    }

    // Group message (bot @mentioned)
    if (eventType === "GROUP_AT_MESSAGE_CREATE") {
      const groupOpenid = data.group_openid;
      const userOpenid  = data.author?.member_openid;
      const msgId       = data.id;
      // Remove @bot mention from text
      let text = data.content?.trim() || "";
      text = text.replace(/<@!\d+>/g, "").trim();
      if (!groupOpenid || !text) return;

      const userId = userOpenid || groupOpenid;
      await handleMessage(userId, text, (content) => replyGroup(groupOpenid, msgId, content));
      return;
    }

    // Guild channel message
    if (eventType === "AT_MESSAGE_CREATE") {
      const channelId = data.channel_id;
      const userId    = data.author?.id;
      const msgId     = data.id;
      let text = data.content?.trim() || "";
      text = text.replace(/<@!\d+>/g, "").trim();
      if (!channelId || !text) return;

      await handleMessage(userId, text, async (content) => {
        const chunks = core.splitText(content);
        for (const chunk of chunks) {
          await qqApi("POST", `/channels/${channelId}/messages`, {
            content: chunk,
            msg_id: msgId,
          });
        }
      });
      return;
    }

  } catch (e) {
    core.logger.error("Webhook parse error:", e.message);
    if (!res.headersSent) { res.writeHead(200); res.end("OK"); }
  }
});

server.listen(QQ_PORT, () => {
  core.logger.info(`QQ Bot webhook server listening on port ${QQ_PORT}`);
  core.logger.info("Waiting for messages...");
});

process.on("SIGINT",  () => { server.close(); process.exit(0); });
process.on("SIGTERM", () => { server.close(); process.exit(0); });
