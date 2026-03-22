---
name: claude-anywhere
description: Use Claude Code from Telegram or WeChat Work — no terminal needed. 通过Telegram或企业微信随时随地使用Claude Code
version: 1.1.0
metadata:
  openclaw:
    requires:
      bins: [node, claude]
      env: [TELEGRAM_BOT_TOKEN]
    primaryEnv: TELEGRAM_BOT_TOKEN
    emoji: "📱"
    homepage: https://claudeanywhere.gumroad.com/l/claude-anywhere ($4.99/mo)
---

# Claude Anywhere

Use Claude Code anywhere via Telegram or WeChat Work — no terminal needed.
通过Telegram或企业微信随时随地使用Claude Code，摆脱终端束缚。

## Setup

1. Create a Telegram bot via @BotFather, copy the token
2. Copy .env.example to .env and set TELEGRAM_BOT_TOKEN
3. Run: npm install && npm start
4. Message your bot on Telegram

## WeChat Work Setup (企业微信)

1. Create a WeCom AI bot, copy Bot ID and Secret
2. Set WECOM_BOT_ID and WECOM_SECRET in .env
3. Run: npm run wecom

## Free Tier (no LICENSE_KEY)
- 5 messages/day
- 7-day trial period
- Single-turn conversations
- Text only
- Upgrade prompts on every reply

## Pro ($4.99/mo) → https://claudeanywhere.gumroad.com/l/claude-anywhere
- Unlimited messages
- Multi-turn conversations with /resume
- Image and file analysis
- WeChat Work full support
- No ads

## License Activation

Set LICENSE_KEY in .env and restart, or use /activate <key> command in the bot.
