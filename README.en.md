<div align="center">

# Fenghua Zhengmao · High School Memory Forum

**A class-year community for alumni stories · Keep the scattered memories from expiring**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.x-blue.svg)](LICENSE)
[![Commercial](https://img.shields.io/badge/Commercial-Need%20License-orange.svg)](#-commercial-license-required)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contributing)

[简体中文](README.md) · **English**

</div>

---

## What is this

A lightweight community site for high school alumni, organized by **enrollment year** (e.g. Class of 2018 / 2019 / 2020). Features: **posts with images, topics (`#tag`), threaded comments, private messages, favorites, likes and reputation titles**.

The UI draws on the three-column layout of [Discourse](https://www.discourse.org/) and the card/color style of [bbs-go](https://github.com/mlogclub/bbs-go) (GPL-3.0). **All code is my own implementation.** The landing page reads "At the time, we thought it was nothing unusual."

> Motivation: WeChat group photos expire after 90 days, and chat history is lost when you switch phones. These things deserve to be kept.

## Features

| | Capability | Description |
|---|---|---|
| 🎓 | **Class-year sections** | Posts are auto-filed into the author's enrollment year; categories = admin config ∪ registered users' years |
| 📝 | **Rich posts** | Title + `#topic` + body + up to 9 images (client-side compression) |
| 💬 | **Threaded comments** | Two-level nesting, optional images (max 3), cascading delete |
| ❤️ | **Likes & titles** | Like posts/comments; user reputation from Lv1 to Lv9 |
| ✉️ | **Direct messages** | Text only; one message allowed until the recipient replies (anti-spam) |
| ⭐ | **Favorites** | View in profile; stale entries auto-pruned |
| 🔔 | **Notifications** | Comment / reply / like / favorite notify the author; latest 50 kept |
| 🌓 | **Theme** | Dark (default) / Light, **synced to your account** across devices |
| 📱 | **Mobile** | Push-style sidebar, tuned for 360px portrait, no horizontal overflow |
| 🛠 | **Admin panel** | Stats, user CRUD, password reset, topic pin/delete |

## Quick start

```bash
# 1. Clone
git clone https://github.com/DHJ999/highschool-forum.git
cd highschool-forum

# 2. Install dependencies
npm install

# 3. First-time config (required, see below)
cp server/config.example.json server/config.json
# then edit server/config.json with your credentials

# 4. Run
npm start
# open http://127.0.0.1:8123
```

> Opening the HTML files directly only allows browsing. Login and posting require the backend.
> Access from LAN devices via `http://<local-ip>:8123` (same Wi-Fi; allow Node through the firewall).

## First-time configuration

This repository **contains no real credentials**. `server/config.json` is excluded by `.gitignore`; only the template `server/config.example.json` is tracked.

### 1. Create your config

```bash
cp server/config.example.json server/config.json
```

### 2. Fill in the fields

| Field | Description |
|---|---|
| `smtp.user` | Sender email, e.g. `yourname@qq.com` |
| `smtp.pass` | **SMTP authorization code** (not the mailbox password) |
| `admin.username` | Admin login account (any email format) |
| `admin.password` | Admin password — use a strong one |

### 3. Getting a QQ Mail SMTP authorization code

1. Sign in to [QQ Mail](https://mail.qq.com) → Settings → Account
2. Find the "POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV Service" section
3. Enable **IMAP/SMTP service** (SMS verification required)
4. Click "Generate authorization code" — you'll get 16 letters
5. Paste it into `smtp.pass`

> ⚠️ The code grants send permission for the mailbox. **If leaked, delete and regenerate it immediately.**

### 4. Environment variables (optional, for Docker / servers)

Every value in the config file can be overridden by environment variables (higher priority):

```bash
PORT=8123 \
SMTP_USER=yourname@qq.com \
SMTP_PASS=your_auth_code \
ADMIN_USERNAME=admin@example.com \
ADMIN_PASSWORD=your_strong_password \
npm start
```

Supported: `PORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

> If only environment variables are set and `server/config.json` is missing, the app falls back to `config.example.json` and warns you.

## Pages

| Page | File | Description |
|---|---|---|
| Plaza (home) | `index.html` | Three columns: years/tags (top-5 highlighted) + topic feed (latest/hot, 10 per page) + user card & site stats |
| Topic detail | `topic.html?id=xx` | Post card (author/title/body/lightbox/action bar) + threaded comments + author card |
| New post | `post.html` | Title + `#topic` + body + images (max 9, auto-compressed) |
| Login / Register | `login.html` | Three modes: login (nickname or email) / register (email code) / forgot password |
| Profile | `me.html` | My posts / my comments / my favorites |
| Messages | `messages.html` | Conversation list + chat window |
| Change email | `email.html` | Verification code sent to the new address |
| Admin | `admin.html` | Stats, user management, topic management |

## Reputation titles

| Level | Title | Likes |
|---|---|---|
| Lv1 | Newcomer | 0+ |
| Lv2 | Emerging | 10+ |
| Lv3 | Active | 50+ |
| Lv4 | Popular | 100+ |
| Lv5 | Core | 200+ |
| Lv6 | Opinion Leader | 300+ |
| Lv7 | Veteran | 500+ |
| Lv8 | Senior Veteran | 800+ |
| Lv9 | Hall of Fame | 1000+ |

A user can receive at most 10 "thumbs up" per day; un-liking does not refund the quota (anti-abuse).

## Project structure

```
highschool-forum/
├── index.html / topic.html / post.html / login.html
├── me.html / messages.html / email.html / admin.html
├── css/
│   ├── style.css                    Global styles (dual themes + mobile)
│   └── vendor/cropper.min.css       Cropper.js v1.6.2 (MIT)
├── js/
│   ├── app.js                       Plaza & topic rendering / interaction
│   ├── auth.js                      Session, user menu, avatar upload/crop
│   ├── login.js / post.js / me.js / messages.js / email.js / admin.js
│   ├── data.js                      Site & class-year base config
│   └── vendor/cropper.min.js        Cropper.js v1.6.2 (MIT)
├── server/
│   ├── server.js                    Express backend (API + static + stats)
│   ├── mailer.js                    SMTP verification code sender
│   ├── store.js                     JSON file database (atomic writes)
│   ├── config.example.json          Config template
│   └── data/                        db.json + uploads/ (git-ignored)
└── assets/*.svg                     Hand-drawn style illustrations
```

## Tech stack

- **Frontend**: vanilla JavaScript (IIFE) + hand-written CSS — zero build, zero framework
- **Backend**: Node.js + Express 4
- **Storage**: JSON file (atomic writes); images on local disk under `uploads/`
- **Auth**: scrypt password hashing + HttpOnly cookies + email verification codes

> Design choice: **keep it as simple as possible to run.** No bundler, no database dependency — clone and go.

## Data & backup

- All data lives in `server/data/`: `db.json` (users/topics/comments/messages/notifications) + `uploads/` (images)
- **Backup**: stop the server and copy the `server/data/` directory
- Site name and base class-years are in `js/data.js`

## Maintenance notes

- **Changing port / auth code / admin password**: edit `server/config.json` only, then restart
- **Static asset caching**: HTML references carry `?v=N`; bump it after changing JS/CSS
- **Rollback**: find a baseline with `git log`, then `git checkout <hash> -- .`

## Roadmap

- [ ] JSON → SQLite (same interface, seamless swap)
- [ ] Strip EXIF from uploaded images (prevent GPS leakage)
- [ ] Multi-size images + WebP responsive delivery
- [ ] Moderation queue
- [ ] Yearly commemorative PDF export

## Caveats

This project was built and is maintained by an individual, targeting **small, private alumni communities**. Before using it for large-scale public deployment, you should add:

- EXIF stripping and content moderation
- Object storage + CDN (images are currently on local disk)
- Migration from JSON to SQLite / PostgreSQL
- Backup and monitoring strategy

## Contributing

Issues and PRs are welcome. Before submitting, make sure you:

1. Include no real credentials (SMTP codes, passwords)
2. Include no third-party private data (photos, contact info)
3. Follow the existing style (2-space indent, Chinese comments)

## License

This project is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

### You may freely

- ✅ Use for personal study, research, hobby projects, and amateur pursuits
- ✅ Use by schools, charities, public research organizations, and government institutions
- ✅ Modify the source code and create derivative works
- ✅ Distribute copies for noncommercial purposes (with this license and copyright notice retained)

### You may not

- ❌ **Use for any commercial purpose** (including selling the software, paid SaaS, or embedding into commercial products)
- ❌ Sublicense or transfer any license
- ❌ Distribute after removing the copyright notice

### Commercial license required?

For commercial use, please request a license by:

> Opening an issue titled **"Commercial License Inquiry"** on [Issues](https://github.com/DHJ999/highschool-forum/issues), or contacting the author via the project page.

### UI style references (design ideas only)

- [Discourse](https://www.discourse.org/) (GPL-2.0) — three-column layout idea
- [bbs-go](https://github.com/mlogclub/bbs-go) (GPL-3.0) — card and color style
- [Cropper.js](https://github.com/fengyuanchen/cropperjs) (MIT) — avatar cropping

> This project is an **independent implementation**; no source code was copied from the projects above.

---

<div align="center">

**At the time, we thought it was nothing unusual**

</div>
