# Claude Anywhere

Use Claude Code from Telegram or WeChat Work — no terminal needed.
通过Telegram或企业微信随时随地使用Claude Code，摆脱终端束缚。

## Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| Messages/day | 5 | Unlimited |
| Trial period | 7 days | — |
| Multi-turn chat | ✗ | ✓ |
| Image analysis | ✗ | ✓ |
| File analysis | ✗ | ✓ |
| WeChat Work | Limited | Full |
| Ads | ✓ | ✗ |

**Upgrade to Pro → [gumroad.com/l/claude-anywhere](https://gumroad.com/l/claude-anywhere) ($4.99/mo)**

---

## Telegram Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather), copy the token
2. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`
3. Run: `npm install && npm start`
4. Message your bot on Telegram

## WeChat Work Setup（企业微信）

1. 创建企业微信 AI Bot，获取 Bot ID 和 Secret
2. 在 `.env` 中设置 `WECOM_BOT_ID` 和 `WECOM_SECRET`
3. 运行：`npm install && npm run wecom`
4. 在企业微信中发消息即可使用

---

## Commands

| Command | Description |
|---|---|
| `/new` | Start a fresh conversation |
| `/status` | Show tier & daily usage |
| `/activate <key>` | Activate Pro license |
| `/help` | Show help & feature comparison |

---

## Deploy with systemd

**Telegram:**
```bash
sudo cp systemd/claude-anywhere.service /etc/systemd/system/
sudo systemctl enable --now claude-anywhere
```

**WeChat Work:**
```bash
sudo cp systemd/claude-anywhere-wecom.service /etc/systemd/system/
sudo systemctl enable --now claude-anywhere-wecom
```

---

*中文说明：将 `.env.example` 复制为 `.env`，Telegram用户填入 Bot Token，企业微信用户填入 WECOM_BOT_ID 和 WECOM_SECRET，运行 `npm install` 后按平台启动。免费版每日5条、7天试用期，升级 Pro 解锁无限对话、图片/文件分析和完整企业微信支持。*
