# Changelog

All notable changes to Claude Anywhere are documented here.

---

## [1.6.0] — 2026-03-27

### Added
- **微信支付自动开通 Pro / WeChat Pay auto-activation**: Users who hit the free-tier daily limit or trial expiry now receive a personalized purchase link. Scanning the QR code and paying activates Pro **instantly and automatically** — no license key entry needed.
- **Bot 主动推送购买链接 / Bot-initiated purchase prompt**: Telegram and WeChat Work bots proactively send the purchase link the moment a free-tier limit is reached, instead of requiring the user to type `/buy`.
- **`/buy` command**: Generates a unique `https://claudeanywhere.com/buy.html?mid=<machine_id>` link so any purchase is bound to the correct machine automatically.
- **微信 Native 扫码支付后端 / WeChat Pay Native backend** (`claude-anywhere-server`):
  - New `orders` table tracking order→machine_id binding
  - `POST /api/wechat/pay/native` — creates WeChat Pay QR code
  - `GET /api/wechat/pay/query/:orderNo` — polls payment status
  - `POST /api/wechat/pay/notify` — WeChat payment callback, auto-creates and activates license on success
- **License auto-bind on first use**: `verifyLicense` now auto-binds machine on first call, removing the separate `/activate` step for new users.

### Changed
- Free-tier limit messages now include a direct purchase link instead of static upgrade text.

---

## [1.5.1] — 2026-03-18

### Fixed
- QQ Bot cron result delivery broken after Tencent disabled proactive messaging (fallback logging added)

---

## [1.5.0] — 2026-03-15

### Added
- **QQ Bot image and file analysis**: Send photos or file attachments to QQ Bot for Claude analysis
- **QQ Bot WebSocket mode**: Rewritten to use WebSocket connection — no public IP required
- **Three-platform unified release**: `npm start` launches all configured platforms simultaneously

---

## [1.4.0] — 2026-02-28

### Added
- **Cron scheduled tasks** (`/cron`): Schedule recurring Claude tasks with natural language
- Cron result delivery to originating chat

---

## [1.3.0] — 2026-02-10

### Added
- **Session management** (`/sessions`, `/resume`): Resume conversations across devices and platforms
- Cross-platform session sharing (Telegram session resumable from WeChat Work, and vice versa)

---

## [1.2.0] — 2026-01-20

### Added
- **File analysis** (Pro): Send PDF, Excel, CSV, or code files to Claude for analysis
- **Image analysis** (Pro): Send screenshots or photos for visual analysis

---

## [1.1.0] — 2026-01-05

### Added
- **WeChat Work (企业微信) support**: Full bridge for WeCom AI Bot
- Pro / Free tier system with daily quota enforcement

---

## [1.0.0] — 2025-12-15

### Added
- Initial release: Telegram bridge connecting Claude Code CLI
- Read/write files, execute commands, analyze images via Telegram
- Free tier: 5 messages/day, 7-day trial
