---
name: claude-anywhere
description: "不是聊天机器人，是你口袋里的AI员工。把Claude Code的全部能力（读写文件、执行命令、代码操作）带到手机上，结合OpenClaw技能生态，随时随地操控你的电脑。Not a chatbot — your AI engineer in your pocket. Claude Code + OpenClaw, via Telegram & WeChat Work."
version: 1.3.0
metadata:
  openclaw:
    requires:
      bins: [node, claude]
      env: [TELEGRAM_BOT_TOKEN]
    primaryEnv: TELEGRAM_BOT_TOKEN
    emoji: "📱"
    homepage: https://claudeanywhere.gumroad.com/l/claude-anywhere ($5.99/mo)
---

# Claude Anywhere

不是聊天机器人。是你口袋里的 AI 员工。
Not a chatbot. Your AI engineer, in your pocket.

读文件、写代码、跑脚本、分析数据——在地铁上也能做。
Read files, write code, run scripts, analyze data — even on the subway.

Claude Code 的全部能力 + OpenClaw 技能生态，通过 Telegram / 企业微信随时随地操控你的电脑。
Every power of Claude Code + OpenClaw skill ecosystem, via Telegram & WeChat Work.

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

## Pro ($5.99/mo) → https://claudeanywhere.gumroad.com/l/claude-anywhere
- Unlimited messages
- Multi-turn conversations with /resume
- Image and file analysis
- WeChat Work full support
- No ads

## License Activation

Set LICENSE_KEY in .env and restart, or use /activate <key> command in the bot.
