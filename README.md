# 风华正茂 · 高中同学故事纪念站

按年级组织的高中同学社区：发帖（图文）、#话题、楼中楼评论、私信、收藏、点赞与获赞头衔。
界面借鉴 [Discourse](https://www.discourse.org/) 的三栏结构与 [bbs-go](https://github.com/mlogclub/bbs-go)（GPL-3.0）的卡片与配色风格，代码全部自研；进入页「当时只道是寻常」。

## 首次配置（必须先做这一步）

本仓库**不包含任何真实凭据**。`server/config.json` 已被 `.gitignore` 排除，仓库里只有模板 `server/config.example.json`。

### 1. 生成你的本地配置

```bash
cp server/config.example.json server/config.json
```

### 2. 填写凭据

编辑 `server/config.json`：

| 字段 | 说明 |
|---|---|
| `smtp.user` | 你的发件邮箱，例如 `yourname@qq.com` |
| `smtp.pass` | QQ 邮箱的 **SMTP 授权码**（不是 QQ 登录密码） |
| `admin.username` | 管理员登录账号（任意邮箱格式即可） |
| `admin.password` | 管理员登录密码，请设为强密码 |

### 3. 如何获取 QQ 邮箱 SMTP 授权码

1. 登录 [QQ 邮箱](https://mail.qq.com) → 顶部「设置」→「账号」
2. 找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务」
3. 开启 **「IMAP/SMTP 服务」**（需短信验证）
4. 点击「生成授权码」，短信验证后得到一串 16 位字母
5. 把这串字母填入 `smtp.pass`

> ⚠️ 授权码等同于邮箱的发信权限，**泄露后请立即在邮箱设置中删除并重新生成**。

### 4. 用环境变量覆盖（可选，适合 Docker / 服务器部署）

配置文件中的值都可以被环境变量覆盖，优先级更高：

```bash
PORT=8123 \
SMTP_USER=yourname@qq.com \
SMTP_PASS=your_auth_code \
ADMIN_USERNAME=admin@example.com \
ADMIN_PASSWORD=your_strong_password \
node server/server.js
```

支持的环境变量：`PORT`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM_NAME`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`。

> 若只设置了环境变量、没有 `server/config.json`，程序会自动回退到 `config.example.json` 并提示你补全。

## 快速启动

```bash
npm install                                        # 首次
cp server/config.example.json server/config.json   # 首次配置（见上节）
node server/server.js                             # 或 npm start，默认端口 8123
```

访问 <http://127.0.0.1:8123>（静态页面双击打开仅可浏览，登录/发帖等需后端运行）。
手机等局域网设备访问 `http://<电脑内网IP>:8123`（需同一 Wi-Fi，防火墙放行 Node）。

## 页面一览

| 页面 | 地址 | 说明 |
|---|---|---|
| 广场（首页） | `index.html` | 三栏：左年级/标签（热度 Top5 高亮）+ 中话题流（帖子行=头像+两行头部「昵称+头衔/发布时间」、标题≤2行、摘要≤3行、标签与计数；最新/热门排序）+ 右用户卡/站点统计 |
| 话题详情 | `topic.html?id=xx` | 主楼卡片（作者/头衔/正文/图片灯箱 + 浏览·点赞·评论·收藏操作栏）、评论卡片（楼中楼；头部为大头像 + 右侧两行：昵称+头衔徽章、发布时间）、作者卡（赞一个/私信横排按钮；窄屏收起为右缘浮条，点开右侧抽屉、点空白收回） |
| 发布帖子 | `post.html` | 标题 + `#话题` 输入（预选下拉/创建新话题）+ 正文（可空）+ 图片（9 张，自动压缩） |
| 登录/注册 | `login.html` | 独立页三模式：登录（昵称或邮箱）/ 注册（邮箱验证码）/ 忘记密码 |
| 个人中心 | `me.html` | 我发布的 / 我评论的 / 我的收藏（失效收藏自动清理） |
| 私信 | `messages.html` | 会话列表 + 聊天窗（仅文字）；对方回复前只能发一条，回复后畅聊 |
| 管理后台 | `admin.html` | 管理员登录；站点统计、用户管理（搜索/编辑/重置密码/删除）、话题管理（置顶/删除） |

## 核心功能

- **账号**：邮箱验证码注册（QQ 邮箱 SMTP）、scrypt 密码、HttpOnly Cookie 会话；昵称或邮箱登录；头像支持上传自定义图片（Cropper.js 裁剪：拖拽/缩放/旋转，先预览确认再保存）或颜色+首字；更换邮箱（新邮箱验证码）；入学年级仅可自助修改一次
- **内容**：发帖自动归入发帖人年级；年级分类 = 后台基础配置 ∪ 注册用户年级；`#话题` 全站联动；浏览量按访客去重（一人一帖只 +1）
- **互动**：
  - 帖子/评论点赞（楼中楼、级联删除、操作通知）
  - 「赞一个」用户获赞：挂在右侧作者卡，每人一票可取消，每天收到上限 10 个（取消不返还额度）
  - **获赞头衔**：Lv1 社区萌新 → Lv2 初露锋芒(≥10) → Lv3 活跃达人(≥50) → Lv4 人气用户(≥100) → Lv5 核心红人(≥200) → Lv6 意见领袖(≥300) → Lv7 论坛元老(≥500) → Lv8 资深元老(≥800) → Lv9 殿堂级大神(≥1000)，显示于楼主名旁/评论名旁/作者卡
- **私信规则**：仅文字；对方回复你之前只能发送一条，对方回复后双方畅聊（无关注等前置条件）
- **管理**：站点统计、用户增删改（删除级联清理发帖/评论/获赞数据）、话题置顶/删除（同步清理收藏与点赞）
- **主题**：深色（默认）/浅色，参考 bbs-go 配色；入口在用户菜单「◐ 深浅色」，**设置跟随账号**（登录加载时覆盖本地偏好，换设备登录保持一致）；游客用顶栏 ◐ 存本地；移动端抽屉式侧栏、顶栏/徽章/评论头自适应（已适配 360px 竖屏，评论徽章不拆行、页面零横向溢出）

## 目录结构

```
dmsyzx-forum/
├── index.html / topic.html / post.html / login.html / me.html / messages.html / admin.html
├── css/
│   ├── style.css        全站样式（两套主题变量 + 移动端适配）
│   └── vendor/cropper.min.css   Cropper.js v1.6.2（MIT）头像裁剪
├── js/
│   ├── app.js           广场/话题详情（列表、评论、作者卡、灯箱）
│   ├── auth.js          登录态/用户菜单/头像上传与裁剪/资料弹窗
│   ├── login.js / post.js / me.js / messages.js / admin.js   各页面逻辑
│   ├── data.js          站点与年级基础配置（示例话题已清空）
│   └── vendor/cropper.min.js    Cropper.js v1.6.2（MIT）
├── server/
│   ├── server.js        Express 后端（API + 静态托管 + 访问统计）
│   ├── mailer.js        QQ 邮箱 SMTP 发验证码
│   ├── store.js         JSON 文件数据库（原子写入）
│   ├── config.json      端口/SMTP/管理员凭据（敏感，勿公开提交）
│   └── data/            db.json 数据 + uploads/ 图片（git 忽略）
└── assets/*.svg         手绘风插画（进入页背景等）
```

## 数据与备份

- 全部数据在 `server/data/`：`db.json`（用户/话题/评论/私信/获赞/通知等）+ `uploads/`（头像与帖子图片）
- **备份**：停服后拷贝 `server/data/` 目录即可
- 站点名称与基础年级分类在 `js/data.js`（示例话题已清空，全部内容来自用户发帖）

## 运维备忘

- **改端口/邮箱授权码/管理员账号密码**：只改 `server/config.json`，重启生效（管理员凭据以配置为准；管理员账号不展示在用户侧）
- **版本管理**：本目录是 git 仓库，每次功能改动有 commit；回滚用 `git log` 找基线后 `git checkout <hash> -- .`
- **静态资源缓存**：HTML 引用带 `?v=N` 版本号，改动 JS/CSS 后需同步升版本（当前 v=97）

## Demo → 正式版路线

1. 数据库 JSON → SQLite（接口不变）
2. 部署：Node 常驻 + Nginx 反代 + HTTPS + 域名（国内需备案）
