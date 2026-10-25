/* JSON 文件数据库：正式版可无缝替换为 SQLite，接口不变 */
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");
let db = null;

function fresh() {
  return {
    users: [],            // {id, email, nickname, color, pass, role, createdAt}
    sessions: {},         // token -> {uid, expires}
    adminSessions: {},    // token -> {expires}
    codes: {},            // email -> {code, expires, attempts}
    topics: [],           // 用户发布的话题
    replies: {},          // topicId -> [{id, uid, nickname, color, time, text, likes}]
    counters: { userId: 1, topicId: 1, replyId: 1 },
  };
}

function get() {
  if (!db) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {
      db = fresh();
      save();
    }
  }
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function nextId(name) {
  const d = get();
  d.counters[name] = (d.counters[name] || 1);
  return d.counters[name]++;
}

module.exports = { get, save, nextId };
