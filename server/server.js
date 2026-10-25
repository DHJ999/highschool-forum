/* ============================================================
 * 风华正茂 · 后端服务
 * 静态托管 + 邮箱验证码注册 + 登录会话 + 管理员模块
 * ============================================================ */
const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const store = require("./store");
const { createMailer } = require("./mailer");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const db = store.get();

/* ---------- 工具 ---------- */
function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 32).toString("hex");
  return salt + ":" + hash;
}
function verifyPw(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(":");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(String(pw), salt, 32));
  } catch { return false; }
}
const token = () => crypto.randomBytes(32).toString("hex");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL = 5 * 60 * 1000;
const SESSION_TTL = 7 * 24 * 3600 * 1000;

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setCookie(res, name, value, maxAge) {
  res.setHeader("Set-Cookie",
    `${name}=${value}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAge / 1000)}; SameSite=Lax`);
}
function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const s = db.sessions[sid];
  if (!s || s.expires < Date.now()) { delete db.sessions[sid]; return null; }
  return db.users.find((u) => u.id === s.uid) || null;
}
function isAdmin(req) {
  const aid = parseCookies(req).aid;
  if (aid) {
    const s = db.adminSessions[aid];
    if (s && s.expires > Date.now()) return true;
    if (s) delete db.adminSessions[aid];
  }
  const u = currentUser(req);
  return !!(u && u.role === "admin");
}
const pubUser = (u) => ({ id: u.id, email: u.email, nickname: u.nickname, color: u.color, role: u.role, grade: u.grade ?? null, gradeChanged: !!u.gradeChanged, tags: u.tags || [], createdAt: u.createdAt });

/* 管理员凭据：每次启动以 config 为准重新哈希 */
db.adminCred = { username: config.admin.username, pass: hashPw(config.admin.password) };

/* 管理员同时播种为普通用户账号（邮箱登录，role=admin），凭据同样以 config 为准 */
{
  const a = db.users.find((u) => u.email === config.admin.username);
  if (a) {
    a.pass = hashPw(config.admin.password);
    a.role = "admin";
  } else {
    db.users.push({
      id: store.nextId("userId"),
      email: config.admin.username,
      nickname: "管理员",
      color: "#e05b5b",
      pass: hashPw(config.admin.password),
      role: "admin", grade: null, createdAt: Date.now(),
    });
  }
}
store.save();

const mailer = createMailer(config.smtp);
mailer.verify()
  .then(() => console.log("[SMTP] 邮箱服务连接正常:", config.smtp.user))
  .catch((e) => console.error("[SMTP] 连接失败，验证码将无法发送:", e.message));

const codeLog = new Map(); // 邮箱 -> 上次发送时间（60s 限流）

const app = express();
app.use(express.json());

/* ---------- 访问量统计（只计页面浏览，不记 API 与静态资源） ---------- */
db.stats = db.stats || { total: 0, daily: {}, pages: {} };
store.save();
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (req.method === "GET" && !req.path.startsWith("/api") && (!ext || ext === ".html")) {
    const day = new Date().toISOString().slice(0, 10);
    const p = req.path === "/" || req.path === "/index.html" ? "首页"
      : decodeURIComponent(req.path).replace(/^\//, "").replace(/\.html$/, "");
    db.stats.total++;
    db.stats.daily[day] = (db.stats.daily[day] || 0) + 1;
    db.stats.pages[p] = (db.stats.pages[p] || 0) + 1;
    store.save();
  }
  next();
});
app.use(express.static(path.join(__dirname, "..")));

/* ================= 认证 API ================= */

/* 发送验证码 */
app.post("/api/auth/send-code", async (req, res) => {
  const { email } = req.body || {};
  if (!EMAIL_RE.test(email || "")) return res.status(400).json({ error: "邮箱格式不正确" });
  const last = codeLog.get(email) || 0;
  if (Date.now() - last < 60 * 1000) return res.status(429).json({ error: "发送太频繁，请 1 分钟后再试" });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.codes[email] = { code, expires: Date.now() + CODE_TTL, attempts: 0 };
  store.save();
  codeLog.set(email, Date.now());
  if (config.devLogCodes) console.log(`[验证码] ${email} -> ${code}`);

  try {
    await mailer.sendCode(email, code);
    res.json({ ok: true, message: "验证码已发送，请查收邮箱（注意垃圾邮件箱）" });
  } catch (e) {
    console.error("[SMTP] 发送失败:", e.message);
    delete db.codes[email];
    store.save();
    res.status(500).json({ error: "邮件发送失败，请稍后再试或联系管理员" });
  }
});

/* 注册 */
app.post("/api/auth/register", (req, res) => {
  const { email, code, nickname, password, grade } = req.body || {};
  if (!EMAIL_RE.test(email || "")) return res.status(400).json({ error: "邮箱格式不正确" });
  if (!nickname || String(nickname).trim().length < 1) return res.status(400).json({ error: "请填写昵称" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "密码至少 6 位" });
  const g = Number(grade);
  if (!Number.isInteger(g) || g < 1990 || g > 2026) return res.status(400).json({ error: "请选择入学年级（1990–2026）" });

  const rec = db.codes[email];
  if (!rec) return res.status(400).json({ error: "请先获取验证码" });
  if (rec.expires < Date.now()) { delete db.codes[email]; return res.status(400).json({ error: "验证码已过期，请重新获取" }); }
  if (rec.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
  if (String(code) !== rec.code) {
    rec.attempts++; store.save();
    return res.status(400).json({ error: "验证码不正确" });
  }
  delete db.codes[email];

  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: "该邮箱已注册，请直接登录" });
  const colors = ["#e07b39", "#5c7a99", "#6f7f5e", "#a8628a", "#4f7a7a", "#8a6bab", "#b98a2e"];
  const user = {
    id: store.nextId("userId"),
    email, nickname: String(nickname).trim().slice(0, 12),
    color: colors[Math.floor(Math.random() * colors.length)],
    pass: hashPw(password), role: "user", grade: g, createdAt: Date.now(),
  };
  db.users.push(user);
  const sid = token();
  db.sessions[sid] = { uid: user.id, expires: Date.now() + SESSION_TTL };
  store.save();
  setCookie(res, "sid", sid, SESSION_TTL);
  res.json({ ok: true, user: pubUser(user) });
});

/* 找回密码：邮箱验证码重置 */
app.post("/api/auth/reset-password", (req, res) => {
  const { email, code, password } = req.body || {};
  if (!EMAIL_RE.test(email || "")) return res.status(400).json({ error: "邮箱格式不正确" });
  if (!password || String(password).length < 6) return res.status(400).json({ error: "新密码至少 6 位" });
  const rec = db.codes[email];
  if (!rec) return res.status(400).json({ error: "请先获取验证码" });
  if (rec.expires < Date.now()) { delete db.codes[email]; return res.status(400).json({ error: "验证码已过期，请重新获取" }); }
  if (rec.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
  if (String(code) !== rec.code) { rec.attempts++; store.save(); return res.status(400).json({ error: "验证码不正确" }); }
  delete db.codes[email];
  const user = db.users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: "该邮箱尚未注册" });
  if (user.role === "admin") return res.status(403).json({ error: "管理员密码请在服务端配置文件中修改" });
  user.pass = hashPw(password);
  /* 重置后强制全端下线 */
  for (const [k, s] of Object.entries(db.sessions)) if (s.uid === user.id) delete db.sessions[k];
  store.save();
  res.json({ ok: true, message: "密码已重置，请使用新密码登录" });
});

/* ---------- 年级分类：基础配置 ∪ 已注册用户的年级 ---------- */
const YEAR_COLORS = ["#e07b39", "#9a6bd8", "#58a666", "#5c7a99", "#a8628a", "#4f7a7a", "#8a6bab", "#b98a2e"];
const BASE_COLORS = { 2018: "#e07b39", 2019: "#9a6bd8", 2020: "#58a666" };
function effectiveCategories() {
  db.categories = db.categories || [2018, 2019, 2020];
  const set = new Set(db.categories.map(Number));
  db.users.forEach((u) => { if (u.role !== "admin" && u.grade) set.add(Number(u.grade)); });
  return [...set]
    .filter((y) => Number.isInteger(y) && y >= 1990 && y <= 2026)
    .sort((a, b) => a - b)
    .map((y) => ({ id: y, label: `${y}级`, color: BASE_COLORS[y] || YEAR_COLORS[(y - 1990) % YEAR_COLORS.length] }));
}
app.get("/api/categories", (req, res) => res.json(effectiveCategories()));
app.post("/api/admin/categories", requireAdmin, (req, res) => {
  const years = (req.body || {}).years;
  if (!Array.isArray(years)) return res.status(400).json({ error: "参数错误" });
  db.categories = [...new Set(years.map(Number)
    .filter((y) => Number.isInteger(y) && y >= 1990 && y <= 2026))].sort((a, b) => a - b);
  store.save();
  res.json({ ok: true, categories: effectiveCategories() });
});

/* 公开站点统计（右侧栏展示用，不含敏感信息；管理员不展示在用户侧） */
app.get("/api/site/stats", (req, res) => {
  const replyCount = Object.values(db.replies).reduce((n, l) => n + l.length, 0);
  const normalUsers = db.users.filter((u) => u.role !== "admin");
  res.json({
    users: normalUsers.length,
    topics: db.topics.length,
    replies: replyCount,
    views: db.stats ? db.stats.total : 0,
    recentUsers: normalUsers.slice(-5).reverse()
      .map((u) => ({ nickname: u.nickname, color: u.color, grade: u.grade ?? null })),
  });
});

/* ---------- 关注 ---------- */
app.post("/api/users/:id/follow", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  const target = db.users.find((u) => u.id === +req.params.id);
  if (!target || target.id === me.id) return res.status(400).json({ error: "无法关注" });
  db.follows = db.follows || {};
  const list = (db.follows[me.id] = db.follows[me.id] || []);
  const i = list.indexOf(target.id);
  if (i >= 0) { list.splice(i, 1); store.save(); return res.json({ ok: true, following: false }); }
  list.push(target.id);
  store.save();
  res.json({ ok: true, following: true });
});
app.get("/api/users/:id/relation", (req, res) => {
  const me = currentUser(req);
  const id = +req.params.id;
  const target = db.users.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  db.follows = db.follows || {};
  const following = me ? (db.follows[me.id] || []).includes(id) : false;
  const followedBy = me ? (db.follows[id] || []).includes(me.id) : false;
  res.json({
    user: { id: target.id, nickname: target.nickname, color: target.color, grade: target.grade ?? null },
    following, followedBy, mutual: following && followedBy,
  });
});

/* ---------- 收藏 ---------- */
app.post("/api/topics/:id/favorite", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  db.favorites = db.favorites || {};
  const list = (db.favorites[me.id] = db.favorites[me.id] || []);
  const i = list.indexOf(req.params.id);
  if (i >= 0) { list.splice(i, 1); store.save(); return res.json({ ok: true, favorited: false }); }
  list.push(req.params.id);
  store.save();
  res.json({ ok: true, favorited: true });
});
app.get("/api/me/favorites", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  db.favorites = db.favorites || {};
  res.json(db.favorites[me.id] || []);
});

/* ---------- 图片上传（登录即可，私信/后续发帖图用） ---------- */
const UPLOAD_DIR = path.join(__dirname, "data", "uploads");
app.post("/api/upload", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/.exec((req.body || {}).data || "");
  if (!m) return res.status(400).json({ error: "仅支持 png/jpg/gif/webp 图片" });
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: "图片大小需在 3MB 以内" });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const fname = `u${me.id}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
  res.json({ ok: true, url: "/uploads/" + fname });
});
app.use("/uploads", express.static(UPLOAD_DIR));

/* ---------- 私信 ---------- */
function isMutual(a, b) {
  db.follows = db.follows || {};
  return (db.follows[a] || []).includes(b) && (db.follows[b] || []).includes(a);
}
function convOf(a, b) {
  return (db.messages || []).filter((m) =>
    (m.from === a && m.to === b) || (m.from === b && m.to === a));
}
/* 发送资格：互关畅聊；否则首个回复出现之前，发起方只能发一条 */
function canSend(uid, other) {
  if (isMutual(uid, other)) return true;
  const conv = convOf(uid, other);
  return conv.length === 0 || conv.some((m) => m.from !== uid);
}

app.get("/api/messages/contacts", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  const lastMap = new Map();
  for (const m of db.messages || []) {
    if (m.from !== me.id && m.to !== me.id) continue;
    const other = m.from === me.id ? m.to : m.from;
    const cur = lastMap.get(other);
    if (!cur || m.time > cur.time) lastMap.set(other, m);
  }
  const contacts = [...lastMap.entries()].map(([otherId, m]) => {
    const u = db.users.find((x) => x.id === otherId);
    return {
      id: otherId,
      nickname: u ? u.nickname : "已注销用户",
      color: u ? u.color : "#888",
      last: (m.text || "[图片]").slice(0, 30),
      lastFromMe: m.from === me.id,
      time: m.time,
      unread: convOf(me.id, otherId).filter((x) => x.to === me.id && !x.read).length,
      mutual: isMutual(me.id, otherId),
    };
  }).sort((a, b) => b.time - a.time);
  res.json(contacts);
});
app.get("/api/messages/:uid", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  const other = +req.params.uid;
  const u = db.users.find((x) => x.id === other);
  if (!u) return res.status(404).json({ error: "用户不存在" });
  (db.messages || []).forEach((m) => { if (m.to === me.id && m.from === other) m.read = true; });
  store.save();
  res.json({
    user: { id: u.id, nickname: u.nickname, color: u.color, grade: u.grade ?? null },
    mutual: isMutual(me.id, other),
    canSend: canSend(me.id, other),
    messages: convOf(me.id, other).sort((a, b) => a.time - b.time),
  });
});
app.post("/api/messages/:uid", (req, res) => {
  const me = currentUser(req);
  if (!me) return res.status(401).json({ error: "请先登录" });
  const other = +req.params.uid;
  if (!db.users.some((u) => u.id === other) || other === me.id) return res.status(400).json({ error: "无法发送" });
  const { text, images } = req.body || {};
  const imgs = Array.isArray(images) ? images.filter((s) => /^\/uploads\//.test(s)).slice(0, 3) : [];
  if ((!text || !String(text).trim()) && !imgs.length) return res.status(400).json({ error: "消息不能为空" });
  if (!canSend(me.id, other)) {
    return res.status(403).json({ error: "对方回复前你只能发送一条消息；互相关注后可以畅聊" });
  }
  db.messages = db.messages || [];
  const msg = {
    id: "m" + store.nextId("replyId"),
    from: me.id, to: other,
    text: String(text || "").trim().slice(0, 500),
    images: imgs, time: Date.now(), read: false,
  };
  db.messages.push(msg);
  store.save();
  res.json({ ok: true, message: msg, mutual: isMutual(me.id, other), canSend: canSend(me.id, other) });
});

/* 我的话题 / 我的回复 */
app.get("/api/me/topics", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  res.json(db.topics.filter((t) => t.uid === user.id));
});
app.get("/api/me/replies", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const out = [];
  for (const [tid, list] of Object.entries(db.replies)) {
    for (const r of list) {
      if (r.uid === user.id) out.push({ id: r.id, text: r.text, time: r.time, topicId: tid });
    }
  }
  out.sort((a, b) => b.time - a.time);
  res.json(out);
});

/* 自助修改资料：昵称 / 头像颜色 */
app.patch("/api/me/profile", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const PALETTE = ["#e07b39", "#5c7a99", "#6f7f5e", "#a8628a", "#4f7a7a", "#8a6bab", "#b98a2e", "#e05b5b"];
  const { nickname, color } = req.body || {};
  if (nickname !== undefined) {
    const n = String(nickname).trim();
    if (!n) return res.status(400).json({ error: "昵称不能为空" });
    user.nickname = n.slice(0, 12);
  }
  if (color !== undefined) {
    if (!PALETTE.includes(color)) return res.status(400).json({ error: "头像颜色无效" });
    user.color = color;
  }
  store.save();
  res.json({ ok: true, user: pubUser(user) });
});

/* 更换邮箱：验证码发送到新邮箱验证 */
app.post("/api/me/email", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  if (user.role === "admin") return res.status(403).json({ error: "管理员账号邮箱固定，请勿更换" });
  const { newEmail, code } = req.body || {};
  if (!EMAIL_RE.test(newEmail || "")) return res.status(400).json({ error: "新邮箱格式不正确" });
  if (newEmail === user.email) return res.status(400).json({ error: "新邮箱不能与当前邮箱相同" });
  if (db.users.some((u) => u.email === newEmail)) return res.status(409).json({ error: "该邮箱已被其他账号使用" });
  const rec = db.codes[newEmail];
  if (!rec) return res.status(400).json({ error: "请先向新邮箱发送验证码" });
  if (rec.expires < Date.now()) { delete db.codes[newEmail]; store.save(); return res.status(400).json({ error: "验证码已过期，请重新获取" }); }
  if (rec.attempts >= 5) return res.status(429).json({ error: "尝试次数过多，请重新获取验证码" });
  if (String(code) !== rec.code) { rec.attempts++; store.save(); return res.status(400).json({ error: "验证码不正确" }); }
  delete db.codes[newEmail];
  user.email = newEmail;
  store.save();
  res.json({ ok: true, user: pubUser(user), message: "邮箱已更换" });
});

/* 用户自助修改入学年级（每个账号仅一次） */
app.post("/api/me/grade", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const g = Number((req.body || {}).grade);
  if (!Number.isInteger(g) || g < 1990 || g > 2026) return res.status(400).json({ error: "请选择入学年级（1990–2026）" });
  if (user.gradeChanged) {
    return res.status(403).json({ error: "入学年级仅可自助修改一次，再次修改请联系管理员：your-email@example.com" });
  }
  user.grade = g;
  user.gradeChanged = true;
  store.save();
  res.json({ ok: true, user: pubUser(user) });
});

/* 登录 */
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email === email);
  if (!user || !verifyPw(password, user.pass)) return res.status(401).json({ error: "邮箱或密码不正确" });
  const sid = token();
  db.sessions[sid] = { uid: user.id, expires: Date.now() + SESSION_TTL };
  store.save();
  setCookie(res, "sid", sid, SESSION_TTL);
  res.json({ ok: true, user: pubUser(user) });
});

/* 退出 / 当前用户 */
app.post("/api/auth/logout", (req, res) => {
  const sid = parseCookies(req).sid;
  if (sid) { delete db.sessions[sid]; store.save(); }
  setCookie(res, "sid", "", 0);
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  const u = currentUser(req);
  res.json({ user: u ? pubUser(u) : null });
});

/* ================= 话题 / 回复 API ================= */

/* 用户发布的话题（与内置示例数据在前端合并展示） */
app.get("/api/topics", (req, res) => {
  res.json(db.topics.map((t) => ({ ...t, replies: undefined })));
});
app.post("/api/topics", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const { title, tags, body } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "标题不能为空" });
  if (!body || !String(body).trim()) return res.status(400).json({ error: "正文不能为空" });
  if (!user.grade) return res.status(400).json({ error: "请先在「个人设置」中选择你的入学年级（头衔），发帖会归入你的年级" });
  const topic = {
    id: "t" + store.nextId("topicId"),
    title: String(title).trim().slice(0, 80),
    category: Number(user.grade),
    tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 5) : [],
    author: user.nickname, color: user.color, uid: user.id,
    created: Date.now(), pinned: false, views: 0, likes: 0,
    body: String(body).split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
    images: [],
  };
  db.topics.unshift(topic);
  store.save();
  res.json({ ok: true, topic });
});
app.delete("/api/topics/:id", (req, res) => {
  const user = currentUser(req);
  const admin = isAdmin(req);
  if (!user && !admin) return res.status(401).json({ error: "未登录" });
  const t = db.topics.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "话题不存在" });
  if (!admin && t.uid !== user.id) return res.status(403).json({ error: "只能删除自己的话题" });
  db.topics = db.topics.filter((x) => x.id !== t.id);
  delete db.replies[t.id];
  store.save();
  res.json({ ok: true });
});

/* 回复（全部走服务端；内置话题的示例回复在前端合并展示） */
app.get("/api/topics/:id/replies", (req, res) => {
  res.json(db.replies[req.params.id] || []);
});
app.post("/api/topics/:id/replies", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const { text, parentId } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: "回复内容不能为空" });
  const tid = req.params.id;
  db.replies[tid] = db.replies[tid] || [];
  const reply = {
    id: "r" + store.nextId("replyId"),
    uid: user.id, nickname: user.nickname, color: user.color,
    time: Date.now(), text: String(text).trim().slice(0, 1000), likes: 0,
    parentId: parentId ? String(parentId).slice(0, 40) : null,
  };
  db.replies[tid].push(reply);
  store.save();
  res.json({ ok: true, reply });
});
app.delete("/api/replies/:tid/:rid", (req, res) => {
  const user = currentUser(req);
  const admin = isAdmin(req);
  if (!user && !admin) return res.status(401).json({ error: "未登录" });
  const list = db.replies[req.params.tid] || [];
  const r = list.find((x) => x.id === req.params.rid);
  if (!r) return res.status(404).json({ error: "回复不存在" });
  if (!admin && r.uid !== user.id) return res.status(403).json({ error: "只能删除自己的回复" });
  db.replies[req.params.tid] = list.filter((x) => x.id !== r.id);
  store.save();
  res.json({ ok: true });
});

/* ================= 管理员 API ================= */
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: "管理员未登录" });
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== db.adminCred.username || !verifyPw(password, db.adminCred.pass)) {
    return res.status(401).json({ error: "管理员账号或密码不正确" });
  }
  const aid = token();
  db.adminSessions[aid] = { expires: Date.now() + SESSION_TTL };
  store.save();
  setCookie(res, "aid", aid, SESSION_TTL);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  const aid = parseCookies(req).aid;
  if (aid) { delete db.adminSessions[aid]; store.save(); }
  setCookie(res, "aid", "", 0);
  res.json({ ok: true });
});
app.get("/api/admin/me", (req, res) => res.json({ admin: isAdmin(req) }));

app.get("/api/admin/overview", requireAdmin, (req, res) => {
  res.json({
    users: db.users.length,
    topics: db.topics.length,
    replies: Object.values(db.replies).reduce((n, l) => n + l.length, 0),
  });
});
app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400e3).toISOString().slice(0, 10);
    days.push({ day: d, count: db.stats.daily[d] || 0 });
  }
  const today = now.toISOString().slice(0, 10);
  res.json({
    total: db.stats.total,
    today: db.stats.daily[today] || 0,
    days,
    pages: db.stats.pages,
  });
});
app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json(db.users.map(pubUser).sort((a, b) => b.createdAt - a.createdAt));
});
app.get("/api/admin/topics", requireAdmin, (req, res) => {
  res.json(db.topics);
});
app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === +req.params.id);
  if (!u) return res.status(404).json({ error: "用户不存在" });
  const { nickname, grade, tags } = req.body || {};
  if (nickname !== undefined) {
    const n = String(nickname).trim();
    if (!n) return res.status(400).json({ error: "昵称不能为空" });
    u.nickname = n.slice(0, 12);
  }
  if (grade !== undefined) {
    const g = grade === null || grade === "" ? null : Number(grade);
    if (g !== null && (!Number.isInteger(g) || g < 1990 || g > 2026)) {
      return res.status(400).json({ error: "入学年级需在 1990–2026 之间" });
    }
    u.grade = g;
  }
  if (tags !== undefined) {
    u.tags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : [];
  }
  store.save();
  res.json({ ok: true, user: pubUser(u) });
});
app.post("/api/admin/users/:id/password", requireAdmin, (req, res) => {
  const u = db.users.find((x) => x.id === +req.params.id);
  if (!u) return res.status(404).json({ error: "用户不存在" });
  if (u.role === "admin") return res.status(403).json({ error: "管理员密码请在 config.json 中修改" });
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ error: "新密码至少 6 位" });
  u.pass = hashPw(password);
  /* 重置密码后踢掉该用户全部会话，强制重新登录 */
  for (const [k, s] of Object.entries(db.sessions)) if (s.uid === u.id) delete db.sessions[k];
  store.save();
  res.json({ ok: true });
});
app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = +req.params.id;
  const target = db.users.find((u) => u.id === id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (target.role === "admin") return res.status(403).json({ error: "不能删除管理员账号" });
  db.users = db.users.filter((u) => u.id !== id);
  db.topics = db.topics.filter((t) => t.uid !== id);
  for (const k of Object.keys(db.replies)) db.replies[k] = db.replies[k].filter((r) => r.uid !== id);
  for (const [tk, s] of Object.entries(db.sessions)) if (s.uid === id) delete db.sessions[tk];
  store.save();
  res.json({ ok: true });
});
app.delete("/api/admin/topics/:id", requireAdmin, (req, res) => {
  const t = db.topics.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "话题不存在" });
  db.topics = db.topics.filter((x) => x.id !== t.id);
  delete db.replies[t.id];
  store.save();
  res.json({ ok: true });
});
app.post("/api/admin/topics/:id/pin", requireAdmin, (req, res) => {
  const t = db.topics.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "话题不存在" });
  t.pinned = !t.pinned;
  store.save();
  res.json({ ok: true, pinned: t.pinned });
});

/* 启动 */
app.listen(config.port, () => {
  console.log(`[风华正茂] 服务已启动: http://127.0.0.1:${config.port}`);
});
