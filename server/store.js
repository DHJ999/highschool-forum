/* JSON 文件数据库：正式版可无缝替换为 SQLite，接口不变 */
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");
let db = null;

/* 全部字段一次性定义好：避免各处 `db.x = db.x || {}` 惰性初始化，
   也避免老版本 db.json 缺字段时行为不一致。 */
function fresh() {
  return {
    users: [],            // {id, email, nickname, color, pass, role, grade, createdAt}
    sessions: {},         // token -> {uid, expires}
    adminSessions: {},    // token -> {expires}
    codes: {},            // email -> {code, expires, attempts}
    topics: [],           // 用户发布的话题
    replies: {},          // topicId -> [{id, uid, nickname, color, time, text, likes}]
    messages: [],         // 私信 {id, from, to, text, time, read}
    notifications: [],    // 通知 {id, to, from, fromName, fromColor, text, topicId, type, time, read}
    favorites: {},        // uid -> [topicId]
    likes: {},            // topicId -> {op|replyId: [uid]}
    userLikes: {},        // uid -> [likerUid]（「赞一个」）
    userLikesDaily: {},   // uid -> {date, count}（每日收赞上限 10）
    categories: [2018, 2019, 2020],
    stats: { total: 0, daily: {}, pages: {} },
    viewCounts: {},       // topicId -> 浏览量
    viewSeen: {},         // 访客键 -> {topicId: 1}
    counters: { userId: 1, topicId: 1, replyId: 1, messageId: 1, notificationId: 1 },
  };
}

/* 老版本 db.json 可能缺字段，用 fresh() 的默认值补齐（不覆盖已有值） */
function ensureShape(d) {
  const base = fresh();
  for (const k of Object.keys(base)) {
    if (d[k] === undefined || d[k] === null) d[k] = base[k];
  }
  /* counters 内部也要补齐新增的计数器 */
  for (const k of Object.keys(base.counters)) {
    if (typeof d.counters[k] !== "number") d.counters[k] = base.counters[k];
  }
  return d;
}

function get() {
  if (!db) {
    try {
      db = ensureShape(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
    } catch {
      db = fresh();
      save();
    }
  }
  return db;
}

/* 原子写：先写临时文件再 rename，避免进程中断留下半截 JSON。
   不做 pretty 打印——db.json 是运行时数据，可读性由编辑器格式化解决，
   紧凑格式体积与序列化开销都更小。 */
let saveTimer = null;
let savePending = false;
function writeNow() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_PATH);
}
function save() {
  /* 合并高频写入：同一 tick 内的多次 save 只落盘一次。
     注意：调用方若紧接着读文件（如退出前），需先 flush()。 */
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!savePending) return;
    savePending = false;
    try { writeNow(); } catch (e) { console.error("[存储] 写盘失败:", e.message); }
  }, 0);
  if (saveTimer.unref) saveTimer.unref();
}
/* 同步立即落盘（进程退出 / 关键节点用） */
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  savePending = false;
  try { writeNow(); } catch (e) { console.error("[存储] 写盘失败:", e.message); }
}

function nextId(name) {
  const d = get();
  d.counters[name] = (d.counters[name] || 1);
  return d.counters[name]++;
}

module.exports = { get, save, flush, nextId };
