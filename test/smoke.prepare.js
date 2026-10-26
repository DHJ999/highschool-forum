/* 准备测试数据：直接写 db.json（必须在启动服务前执行） */
const crypto = require("crypto");
const path = require("path");
const store = require(path.join(__dirname, "..", "server", "store.js"));
const db = store.get();
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync("SmokeTest!2024", salt, 32).toString("hex");
const exist = db.users.find(u => u.email === "tester@example.com");
if (exist) {
  exist.pass = salt + ":" + hash;
  exist.grade = 2021;
  exist.role = "user";
  exist.nickname = "测试员";
} else {
  db.users.push({
    id: store.nextId("userId"), email: "tester@example.com", nickname: "测试员",
    color: "#5c7a99", pass: salt + ":" + hash, role: "user", grade: 2021, createdAt: Date.now(),
  });
}
store.flush();
console.log("✔ 测试用户已就绪: tester@example.com / SmokeTest!2024 (id=" + db.users.find(u => u.email === "tester@example.com").id + ")");
