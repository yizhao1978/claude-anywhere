---
name: claude-anywhere
description: Use Claude Code from Telegram — no terminal needed. 通过Telegram随时随地使用Claude Code
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: [node, claude]
      env: [TELEGRAM_BOT_TOKEN]
    primaryEnv: TELEGRAM_BOT_TOKEN
    emoji: "📱"
    homepage: https://gumroad.com/l/claude-anywhere
---

# Claude Anywhere

Use Claude Code anywhere via Telegram — no terminal needed.
通过Telegram随时随地使用Claude Code，摆脱终端束缚。

## Setup

1. Create a Telegram bot via @BotFather, copy the token
2. Copy .env.example to .env and set TELEGRAM_BOT_TOKEN
3. Run: npm install && npm start
4. Message your bot on Telegram

## Free Tier (this version)
- 5 messages/day
- Single-turn conversations
- Text only

## Pro ($5.99/mo) → https://gumroad.com/l/claude-anywhere
- Unlimited messages
- Multi-turn conversations with /resume
- Image and file analysis
- WeChat Work support
- No ads
