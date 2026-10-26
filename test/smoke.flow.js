/* 完整业务流程回归：注册 → 发帖 → 评论 → 点赞 → 私信 → 收藏 → 通知 → 管理 */
const B = "http://127.0.0.1:8321";
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; console.log("  ❌ " + n + (e ? " → " + JSON.stringify(e) : "")); } };
async function req(path, opts) {
  const r = await fetch(B + path, opts);
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body, headers: r.headers };
}
const J = (d) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
const cookieOf = (r) => (r.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
const withCk = (ck, o) => ({ ...o, headers: { ...(o.headers || {}), Cookie: ck } });

(async () => {
  const path = require("path");
  const fs = require("fs");
  // 管理员凭据优先取环境变量，其次读本地 config.json（未克隆时用 config.example.json 兜底）
  const loadCfg = () => {
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      return { admin: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD } };
    }
    for (const f of ["config.json", "config.example.json"]) {
      const p = path.join(__dirname, "..", "server", f);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    return { admin: { username: "", password: "" } };
  };
  const cfg = loadCfg();
  const readDb = () => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "server", "data", "db.json"), "utf8"));
  const db = readDb();

  console.log("\n── 管理员登录并播种用户 ──");
  let r = await req("/api/admin/login", J({ username: cfg.admin.username, password: cfg.admin.password }));
  const adminCk = cookieOf(r);
  ok("管理员登录成功", r.status === 200, r.body);

  // 测试用户由 smoke.prepare.js 在启动服务前写入 db.json，这里只登录
  const uid = db.users.find(u => u.email === "tester@example.com");
  ok("测试用户存在（prepare 已写入）", !!uid, "缺少测试用户，先跑 smoke.prepare.js");

  console.log("\n── 用户登录 ──");
  r = await req("/api/auth/login", J({ email: "tester@example.com", password: "SmokeTest!2024" }));
  ok("普通用户登录成功", r.status === 200 && r.body.ok === true, r.body);
  const ck = cookieOf(r);
  ok("下发 sid Cookie", /sid=/.test(ck), ck);
  r = await req("/api/me", { headers: { Cookie: ck } });
  ok("GET /api/me 拿到用户", r.body.user && r.body.user.nickname === "测试员", r.body);

  console.log("\n── 发帖 ──");
  r = await req("/api/topics", withCk(ck, J({ title: "回归测试帖", tags: ["测试"], body: "这是冒烟测试创建的内容\n第二行", images: [] })));
  ok("发帖成功", r.status === 200 && r.body.topic, r.body);
  const tid = r.body.topic && r.body.topic.id;
  ok("帖子归入用户年级 2021", r.body.topic && r.body.topic.category === 2021, r.body.topic);
  ok("标题已截断处理", r.body.topic && r.body.topic.title === "回归测试帖", r.body.topic);
  r = await req("/api/topics", withCk(ck, J({ title: "", body: "x" })));
  ok("空标题被拒 400", r.status === 400, r.body);

  console.log("\n── 评论（楼中楼）──");
  r = await req(`/api/topics/${tid}/replies`, withCk(ck, J({ text: "第一条评论" })));
  ok("评论成功", r.status === 200 && r.body.reply, r.body);
  const rid = r.body.reply && r.body.reply.id;
  r = await req(`/api/topics/${tid}/replies`, withCk(ck, J({ text: "回复第一条", parentId: rid })));
  ok("楼中楼回复成功", r.status === 200 && r.body.reply.parentId === rid, r.body);
  const rid2 = r.body.reply && r.body.reply.id;
  r = await req(`/api/topics/${tid}/replies`, withCk(ck, J({ text: "" })));
  ok("空评论被拒 400", r.status === 400, r.body);
  // 不带 Cookie 发评论：应被拒 401（此处刻意不套 withCk）
  r = await req(`/api/topics/${tid}/replies`, J({ text: "未登录测试" }));
  ok("未带 Cookie 发评论被拒 401", r.status === 401, r.body);

  console.log("\n── 级联删除 ──");
  r = await req(`/api/replies/${tid}/${rid}`, { method: "DELETE", headers: { Cookie: ck } });
  ok("删除父评论成功", r.status === 200, r.body);
  ok("级联删掉子回复（removed=2）", r.body.removed === 2, r.body);

  console.log("\n── 点赞 / 获赞头衔 ──");
  r = await req(`/api/topics/${tid}/like`, withCk(ck, J({ target: "op" })));
  ok("帖子点赞成功", r.status === 200 && r.body.liked === true, r.body);
  r = await req(`/api/topics/${tid}/like`, withCk(ck, J({ target: "op" })));
  ok("重复点赞取消", r.body.liked === false, r.body);
  r = await req(`/api/users/${uid.id}/likes`);
  ok("查询获赞状态 200", r.status === 200 && typeof r.body.likes === "number", r.body);
  r = await req(`/api/users/999999/likes`);
  ok("不存在的用户 404", r.status === 404, r.body);

  console.log("\n── 收藏 ──");
  r = await req(`/api/topics/${tid}/favorite`, withCk(ck, J({})));
  ok("收藏成功", r.status === 200 && r.body.favorited === true, r.body);
  r = await req("/api/me/favorites", { headers: { Cookie: ck } });
  ok("收藏列表含该帖", Array.isArray(r.body) && r.body.includes(tid), r.body);
  r = await req("/api/me/favorites", withCk(ck, { method: "POST", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify({ set: [tid, "nonexistent"] }) }));
  ok("收藏自愈写入成功", r.status === 200 && r.body.favorites.length === 2, r.body);

  console.log("\n── 通知 ──");
  r = await req("/api/me/notifications", { headers: { Cookie: ck } });
  ok("通知列表 200", r.status === 200 && Array.isArray(r.body.list), r.body);
  r = await req("/api/me/unread-count", { headers: { Cookie: ck } });
  ok("未读数 200 且含 total", r.status === 200 && typeof r.body.total === "number", r.body);
  r = await req("/api/me/notifications/read", withCk(ck, J({})));
  ok("标记已读成功", r.status === 200, r.body);

  console.log("\n── 私信（反骚扰限发）──");
  const adminId = db.users.find(u => u.email === cfg.admin.username).id;
  r = await req(`/api/messages/${adminId}`, withCk(ck, J({ text: "第一条私信" })));
  ok("首次私信可发", r.status === 200 && r.body.ok === true, r.body);
  r = await req(`/api/messages/${adminId}`, withCk(ck, J({ text: "第二条私信" })));
  ok("对方未回复时被限发 403", r.status === 403, r.body);
  r = await req(`/api/messages/${adminId}`, withCk(ck, J({ text: "" })));
  ok("空消息被拒 400", r.status === 400, r.body);
  r = await req("/api/messages/contacts", { headers: { Cookie: ck } });
  ok("会话列表 200", r.status === 200 && Array.isArray(r.body), r.body);

  console.log("\n── 资料修改 ──");
  r = await req("/api/me/profile", withCk(ck, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify({ nickname: "新昵称", theme: "light" }) }));
  ok("改昵称+主题成功", r.status === 200 && r.body.user.nickname === "新昵称" && r.body.user.theme === "light", r.body);
  r = await req("/api/me/profile", withCk(ck, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify({ nickname: "" }) }));
  ok("空昵称被拒 400", r.status === 400, r.body);
  r = await req("/api/me/profile", withCk(ck, { method: "PATCH", headers: { "Content-Type": "application/json", Cookie: ck }, body: JSON.stringify({ theme: "purple" }) }));
  ok("非法主题被拒 400", r.status === 400, r.body);
  r = await req("/api/me/grade", withCk(ck, J({ grade: 2020 })));
  ok("首次改年级成功", r.status === 200 && r.body.user.grade === 2020, r.body);
  r = await req("/api/me/grade", withCk(ck, J({ grade: 2022 })));
  ok("二次改年级被拒 403", r.status === 403, r.body);
  r = await req("/api/me/grade", withCk(ck, J({ grade: 1800 })));
  ok("越界年级被拒 400", r.status === 400, r.body);

  console.log("\n── 浏览计数去重 ──");
  // 用一个新话题，确保该访客对该帖无浏览记录
  r = await req("/api/topics", withCk(ck, J({ title: "浏览计数测试帖", body: "x" })));
  const vid = r.body.topic && r.body.topic.id;
  r = await req(`/api/topics/${vid}/view`, { method: "POST", headers: { Cookie: ck } });
  ok("浏览计数接口 200", r.status === 200 && typeof r.body.extra === "number", r.body);
  const first = r.body.extra;
  r = await req(`/api/topics/${vid}/view`, { method: "POST", headers: { Cookie: ck } });
  ok("同一访客重复浏览不 +1", r.body.extra === first, { first, second: r.body.extra });

  console.log("\n── 管理后台操作 ──");
  r = await req(`/api/admin/topics/${tid}/pin`, withCk(adminCk, J({})));
  ok("置顶成功", r.status === 200 && r.body.pinned === true, r.body);
  r = await req("/api/admin/users", { headers: { Cookie: adminCk } });
  ok("用户列表 200", r.status === 200 && Array.isArray(r.body), r.body);
  r = await req("/api/admin/stats", { headers: { Cookie: adminCk } });
  ok("统计接口 200 且有 14 天趋势", r.status === 200 && r.body.days.length === 14, r.body && r.body.error);
  r = await req("/api/admin/categories", withCk(adminCk, J({ years: [2018, 2022] })));
  ok("管理员改年级分类成功", r.status === 200, r.body);
  r = await req("/api/categories");
  ok("新分类 2022 生效", r.body.some(c => c.id === 2022), r.body);
  r = await req("/api/admin/categories", withCk(adminCk, J({ years: [2018, 2019, 2020] })));
  ok("年级分类还原", r.status === 200, r.body);

  console.log("\n── 删除话题（级联清理）──");
  r = await req(`/api/topics/${tid}`, { method: "DELETE", headers: { Cookie: ck } });
  ok("删除自己话题成功", r.status === 200, r.body);
  r = await req(`/api/topics/${tid}/replies`);
  ok("话题已删、回复清空", Array.isArray(r.body) && r.body.length === 0, r.body);
  r = await req("/api/me/favorites", { headers: { Cookie: ck } });
  ok("收藏中的该帖已清理", Array.isArray(r.body) && !r.body.includes(tid), r.body);

  console.log("\n── 删除用户（级联清理 P1-4）──");
  const db2 = readDb();
  const target = db2.users.find(u => u.email === "tester@example.com");
  r = await req(`/api/admin/users/${target.id}`, { method: "DELETE", headers: { Cookie: adminCk } });
  ok("删除用户成功", r.status === 200, r.body);
  await new Promise(res => setTimeout(res, 200));
  const db3 = readDb();
  ok("其私信已清理", !db3.messages.some(m => m.from === target.id || m.to === target.id), db3.messages.length);
  ok("其通知已清理", !db3.notifications.some(n => n.from === target.id || n.to === target.id), db3.notifications.length);

  console.log(`\n═══ 通过 ${pass} / 失败 ${fail} ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
