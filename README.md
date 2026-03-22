# Claude Anywhere

Use Claude Code from Telegram — no terminal needed.
通过Telegram随时随地使用Claude Code，摆脱终端束缚。

## Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| Messages/day | 5 | Unlimited |
| Multi-turn chat | ✗ | ✓ |
| Image analysis | ✗ | ✓ |
| File analysis | ✗ | ✓ |
| WeChat Work | ✗ | ✓ |
| Ads | ✓ | ✗ |

**Upgrade to Pro → [gumroad.com/l/claude-anywhere](https://gumroad.com/l/claude-anywhere) ($5.99/mo)**

## Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather), copy the token
2. Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN`
3. Run: `npm install && npm start`
4. Message your bot on Telegram

## Commands

| Command | Description |
|---|---|
| `/new` | Start a fresh conversation |
| `/status` | Show tier & daily usage |
| `/activate <key>` | Activate Pro license |
| `/help` | Show help & feature comparison |

## Deploy with systemd

```bash
sudo cp systemd/claude-anywhere.service /etc/systemd/system/
sudo systemctl enable --now claude-anywhere
```

---

*中文说明：将 `.env.example` 复制为 `.env`，填入 Telegram Bot Token，运行 `npm install && npm start` 即可通过 Telegram 使用 Claude Code。免费版每日5条，升级 Pro 解锁无限对话、图片/文件分析和企业微信支持。*
