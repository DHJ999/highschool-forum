<div align="center">

# 风华正茂 · 高中同学故事纪念站

**按入学年级组织的同学社区 · 让散落的故事不再过期**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.x-blue.svg)](LICENSE)
[![Commercial](https://img.shields.io/badge/Commercial-Need%20License-orange.svg)](#-需要商业授权)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-贡献)
[![Made with](https://img.shields.io/badge/Made%20with-%E2%9D%A4-red)]()

**简体中文** · [English](README.en.md)

</div>

---

## 这是什么

一个轻量的高中同学社区站点。按入学年级（如 2018级 / 2019级 / 2020级）组织内容：**发帖（图文）、# 话题、楼中楼评论、私信、收藏、点赞与获赞头衔**。

界面借鉴 [Discourse](https://www.discourse.org/) 的三栏结构与 [bbs-go](https://github.com/mlogclub/bbs-go)（GPL-3.0）的卡片配色，**代码全部自研**；入口页「当时只道是寻常」。

> 初衷：微信群里的照片 90 天就过期，聊天记录一换手机就丢。这些东西值得被好好收着。

## 特性

| | 能力 | 说明 |
|---|---|---|
| 🎓 | **年级分区** | 发帖自动归入作者的入学年级；分类 = 后台配置 ∪ 已注册用户年级 |
| 📝 | **图文发帖** | 标题 + `#话题` + 正文 + 最多 9 张图（客户端自动压缩） |
| 💬 | **楼中楼评论** | 二级嵌套、可带图（最多 3 张）、级联删除 |
| ❤️ | **点赞与头衔** | 帖子/评论点赞；用户获赞分为 Lv1–Lv9 共 9 级头衔 |
| ✉️ | **私信** | 仅文字；对方回复前限发一条，回复后畅聊（反骚扰） |
| ⭐ | **收藏** | 个人中心查看，失效收藏自动清理 |
| 🔔 | **通知** | 评论/回复/点赞/收藏均通知作者，每人保留最近 50 条 |
| 🌓 | **主题** | 深色（默认）/ 浅色，**设置跟随账号**，换设备保持一致 |
| 📱 | **移动端** | 推挤式侧栏，已适配 360px 竖屏，页面零横向溢出 |
| 🛠 | **管理后台** | 站点统计、用户增删改、重置密码、话题置顶/删除 |

## 快速开始

```bash
# 1. 克隆
git clone https://github.com/DHJ999/highschool-forum.git
cd highschool-forum

# 2. 安装依赖
npm install

# 3. 首次配置（必做，见下节）
cp server/config.example.json server/config.json
# 然后编辑 server/config.json 填入你的凭据

# 4. 启动
npm start
# 打开 http://127.0.0.1:8123
```

> 静态页面双击打开仅可浏览；登录、发帖等需要后端运行。
> 手机等局域网设备访问 `http://<电脑内网IP>:8123`（需同一 Wi-Fi，防火墙放行 Node）。

## 首次配置

本仓库**不包含任何真实凭据**。`server/config.json` 已被 `.gitignore` 排除，仓库里只有模板 `server/config.example.json`。

### 1. 生成配置

```bash
cp server/config.example.json server/config.json
```

### 2. 填写字段

| 字段 | 说明 |
|---|---|
| `smtp.user` | 发件邮箱，例如 `yourname@qq.com` |
| `smtp.pass` | **SMTP 授权码**（不是邮箱登录密码） |
| `admin.username` | 管理员登录账号（任意邮箱格式） |
| `admin.password` | 管理员密码，请设为强密码 |

### 3. 获取 QQ 邮箱 SMTP 授权码

1. 登录 [QQ 邮箱](https://mail.qq.com) → 设置 → 账号
2. 找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务」
3. 开启 **「IMAP/SMTP 服务」**（需短信验证）
4. 点击「生成授权码」，短信验证后得到 16 位字母
5. 填入 `smtp.pass`

> ⚠️ 授权码等同于邮箱发信权限，**泄露后请立即删除并重新生成**。

### 4. 环境变量（可选，适合 Docker / 服务器）

配置文件中的值均可被环境变量覆盖，优先级更高：

```bash
PORT=8123 \
SMTP_USER=yourname@qq.com \
SMTP_PASS=your_auth_code \
ADMIN_USERNAME=admin@example.com \
ADMIN_PASSWORD=your_strong_password \
npm start
```

支持：`PORT`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM_NAME`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`。

> 若只有环境变量、没有 `server/config.json`，程序会自动回退到 `config.example.json` 并提示补全。

## 页面一览

| 页面 | 地址 | 说明 |
|---|---|---|
| 广场（首页） | `index.html` | 三栏布局：左侧年级/标签（热度 Top5 高亮）+ 中部话题流（最新/热门排序，每页 10 条）+ 右侧用户卡与站点统计 |
| 话题详情 | `topic.html?id=xx` | 主楼卡片（作者/头衔/正文/图片灯箱/操作栏）+ 楼中楼评论 + 作者卡（赞一个/私信） |
| 发布帖子 | `post.html` | 标题 + `#话题` + 正文（可空）+ 图片（9 张，自动压缩） |
| 登录/注册 | `login.html` | 三模式：登录（昵称或邮箱）/ 注册（邮箱验证码）/ 忘记密码 |
| 个人中心 | `me.html` | 我发布的 / 我评论的 / 我的收藏 |
| 私信 | `messages.html` | 会话列表 + 聊天窗 |
| 改邮箱 | `email.html` | 验证码发送到新邮箱 |
| 管理后台 | `admin.html` | 统计、用户管理、话题管理 |

## 获赞头衔

| 等级 | 头衔 | 获赞数 |
|---|---|---|
| Lv1 | 社区萌新 | 0+ |
| Lv2 | 初露锋芒 | 10+ |
| Lv3 | 活跃达人 | 50+ |
| Lv4 | 人气用户 | 100+ |
| Lv5 | 核心红人 | 200+ |
| Lv6 | 意见领袖 | 300+ |
| Lv7 | 论坛元老 | 500+ |
| Lv8 | 资深元老 | 800+ |
| Lv9 | 殿堂级大神 | 1000+ |

「赞一个」每人每天最多收到 10 个，取消不返还额度（防刷）。

## 目录结构

```
highschool-forum/
├── index.html / topic.html / post.html / login.html
├── me.html / messages.html / email.html / admin.html
├── css/
│   ├── style.css                    全站样式（双主题变量 + 移动端适配）
│   └── vendor/cropper.min.css       Cropper.js v1.6.2（MIT）
├── js/
│   ├── app.js                       广场 / 话题详情的渲染与交互
│   ├── auth.js                      登录态、用户菜单、头像上传与裁剪
│   ├── login.js / post.js / me.js / messages.js / email.js / admin.js
│   ├── data.js                      站点与年级基础配置
│   └── vendor/cropper.min.js        Cropper.js v1.6.2（MIT）
├── server/
│   ├── server.js                    Express 后端（API + 静态托管 + 访问统计）
│   ├── mailer.js                    SMTP 发送验证码
│   ├── store.js                     JSON 文件数据库（原子写入）
│   ├── config.example.json          配置模板
│   └── data/                        db.json + uploads/（git 忽略）
└── assets/*.svg                     手绘风插画
```

## 技术栈

- **前端**：原生 JavaScript（IIFE）+ 手写 CSS，零构建、零框架
- **后端**：Node.js + Express 4
- **存储**：JSON 文件（原子写入），图片存本地 `uploads/`
- **认证**：scrypt 密码哈希 + HttpOnly Cookie 会话 + 邮箱验证码

> 设计取向：**能用最简单的方式跑起来**。无打包、无数据库依赖，clone 即用。

## 数据与备份

- 全部数据在 `server/data/`：`db.json`（用户/话题/评论/私信/通知等）+ `uploads/`（图片）
- **备份**：停服后复制 `server/data/` 目录即可
- 站点名称与基础年级在 `js/data.js`

## 运维备忘

- **改端口 / 授权码 / 管理员密码**：只改 `server/config.json`，重启生效
- **静态资源缓存**：HTML 引用带 `?v=N`，改动 JS/CSS 后需同步升版本号
- **回滚**：`git log` 找基线后 `git checkout <hash> -- .`

## 后续路线

- [ ] 数据库 JSON → SQLite（接口不变，平滑替换）
- [ ] 图片上传剥离 EXIF（防止 GPS 位置泄露）
- [ ] 图片多尺寸 + WebP 自适应
- [ ] 内容审核队列
- [ ] 年度纪念册 PDF 导出

## 需要说明的事

本项目原始代码由个人开发维护，用于**小规模私密校友社区**。如果你要用于大规模公开部署，请自行补充：

- 图片 EXIF 剥离与内容安全审核
- 对象存储 + CDN（当前图片存本地磁盘）
- 数据库从 JSON 迁移到 SQLite / PostgreSQL
- 备份与监控策略

## 贡献

欢迎提 Issue 或 PR。提交前请确保：

1. 不包含任何真实凭据（邮箱授权码、密码等）
2. 不包含他人隐私信息（照片、联系方式）
3. 遵循现有代码风格（缩进 2 空格、中文注释）

## 许可证

本项目采用 **[PolyForm Noncommercial License 1.0.0](LICENSE)**。

### 你可以自由做

- ✅ 个人学习、研究、业余项目、爱好使用
- ✅ 用于学校、慈善机构、公共研究机构、政府部门等非营利组织
- ✅ 修改源代码、创建衍生作品
- ✅ 在非商业前提下分发副本（需保留本许可证与版权声明）

### 你不能做

- ❌ **任何商业用途**（包括但不限于售卖软件、SaaS 收费、集成进商业产品）
- ❌ 转授许可或转让许可
- ❌ 移除版权声明后分发

### 需要商业授权？

如需商业使用，请通过以下方式联系取得授权：

> 在 [Issues](https://github.com/DHJ999/highschool-forum/issues) 中提交标题为 **「商业授权咨询」** 的 issue，或在项目主页联系作者。

### 界面风格参考（仅借鉴设计思路）

- [Discourse](https://www.discourse.org/)（GPL-2.0）— 三栏布局思路
- [bbs-go](https://github.com/mlogclub/bbs-go)（GPL-3.0）— 卡片与配色风格
- [Cropper.js](https://github.com/fengyuanchen/cropperjs)（MIT）— 头像裁剪

> 本项目为**独立实现**，未复制上述项目的源代码。

---

<div align="center">

**当时只道是寻常**

</div>
