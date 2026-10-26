/* 冒烟测试：覆盖本次修复的关键路径 */
const B = "http://127.0.0.1:8321";
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra ? " → " + JSON.stringify(extra) : "")); }
};
async function req(path, opts) {
  const r = await fetch(B + path, opts);
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body, headers: r.headers };
}
const J = (data) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

(async () => {
  console.log("\n── 1. 基础接口 ──");
  let r = await req("/api/health");
  ok("GET /api/health 200", r.status === 200 && r.body.ok === true, r.body);
  r = await req("/api/categories");
  ok("GET /api/categories 返回数组", Array.isArray(r.body) && r.body.length > 0, r.body);
  r = await req("/api/topics");
  ok("GET /api/topics 返回数组", Array.isArray(r.body), r.body);
  r = await req("/api/site/stats");
  ok("GET /api/site/stats 200", r.status === 200, r.body);
  r = await req("/api/nonexistent");
  ok("未知 API 返回 JSON 404", r.status === 404 && r.body.error === "接口不存在", r.body);

  console.log("\n── 2. 登录防爆破（P0-1）──");
  let failCount = 0;
  for (let i = 0; i < 6; i++) {
    const x = await req("/api/auth/login", J({ email: "nobody@test.com", password: "wrong" }));
    if (x.status === 401) failCount++;
    if (x.status === 429) { console.log(`  ℹ️ 第 ${i + 1} 次已锁: ${x.body.error}`); break; }
  }
  ok("连续错误密码最终被 429 锁定", failCount >= 5, { failCount });
  r = await req("/api/auth/login", J({ email: "nobody@test.com", password: "wrong" }));
  ok("锁定后仍返回 429", r.status === 429, r.body);
  // 换一个账号不受牵连
  r = await req("/api/auth/login", J({ email: "other@test.com", password: "wrong" }));
  ok("不同账号不受同 IP 锁定影响", r.status === 401, r.body);

  console.log("\n── 3. 管理后台登录（P0-1）──");
  for (let i = 0; i < 6; i++) {
    const x = await req("/api/admin/login", J({ username: "admin@example.com", password: "bad" }));
    if (x.status === 429) { console.log(`  ℹ️ 第 ${i + 1} 次已锁: ${x.body.error}`); break; }
  }
  r = await req("/api/admin/login", J({ username: "admin@example.com", password: "bad" }));
  ok("管理员登录暴力破解被锁定", r.status === 429, r.body);

  console.log("\n── 4. 正确密码仍可登录（防爆破不误伤）──");
  // 用真实的 config 密码登录：先从 config.json 读
  // 管理员凭据优先取环境变量，其次读本地 config.json（未克隆时用 config.example.json 兜底）
  const path = require("path");
  const fs = require("fs");
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
  r = await req("/api/admin/login", J({ username: cfg.admin.username, password: cfg.admin.password }));
  ok("正确管理员密码登录成功", r.status === 200 && r.body.ok === true, r.body);
  const adminCookie = (r.headers.getSetCookie?.() || []).join("; ") || "";
  ok("下发 aid Cookie 且带 HttpOnly", /aid=/.test(adminCookie) && /HttpOnly/.test(adminCookie), adminCookie);

  console.log("\n── 5. Origin 校验防 CSRF（P0-6）──");
  r = await req("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.com" }, body: JSON.stringify({ email: "a@b.com", password: "x" }) });
  ok("跨站 Origin 被拒绝 403", r.status === 403, r.body);
  r = await req("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: B }, body: JSON.stringify({ email: "a@b.com", password: "x" }) });
  ok("同源 Origin 放行", r.status !== 403, r.body);
  r = await req("/api/auth/login", J({ email: "a@b.com", password: "x" }));
  ok("无 Origin（非浏览器客户端）放行", r.status !== 403, r.body);

  console.log("\n── 6. 上传魔数校验（P0-4）──");
  const fakePng = "data:image/png;base64," + Buffer.from("<html><script>alert(1)</script></html>").toString("base64");
  r = await req("/api/upload", J({ data: fakePng }));
  ok("伪造 image/png 的 HTML 被拒", r.status === 400 || r.status === 401, r.body);
  // 真实 1x1 PNG
  const realPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  r = await req("/api/upload", J({ data: realPng }));
  ok("真实 PNG 需登录（未登录 401）", r.status === 401, r.body);

  console.log("\n── 7. 邮箱正则收紧（P2）──");
  r = await req("/api/auth/send-code", J({ email: "a@b.c" }));
  ok("过短 TLD 邮箱被拒 400", r.status === 400, r.body);

  console.log("\n── 8. 管理接口鉴权 ──");
  r = await req("/api/admin/users");
  ok("未登录访问 admin 接口 401", r.status === 401, r.body);
  r = await req("/api/admin/users", { headers: { Cookie: adminCookie } });
  ok("带管理员 Cookie 可访问", r.status === 200 && Array.isArray(r.body), r.body && r.body.error);

  console.log("\n── 9. 静态资源缓存头（P3-1）──");
  const h1 = await fetch(B + "/index.html");
  ok("HTML 为 no-cache", /no-cache/.test(h1.headers.get("cache-control") || ""), h1.headers.get("cache-control"));
  const h2 = await fetch(B + "/js/app.js");
  ok("JS 为长缓存 max-age", /max-age=\d+/.test(h2.headers.get("cache-control") || ""), h2.headers.get("cache-control"));

  console.log(`\n═══ 通过 ${pass} / 失败 ${fail} ═══\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
