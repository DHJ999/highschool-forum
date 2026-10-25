/* ============================================================
 * 风华正茂 —— 管理后台（用户管理 / 话题管理）
 * ============================================================ */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const CATS = { 2018: "2018级", 2019: "2019级", 2020: "2020级" };

  /* 恢复主题偏好（admin 页不加载 auth.js，需自行读取） */
  try {
    const s0 = JSON.parse(localStorage.getItem("sjforum.v1"));
    if (s0 && s0.theme) document.documentElement.dataset.theme = s0.theme;
  } catch {}

  /* 主题切换 */
  $("#btnTheme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      const s = JSON.parse(localStorage.getItem("sjforum.v1")) || {};
      s.theme = next;
      localStorage.setItem("sjforum.v1", JSON.stringify(s));
    } catch {}
  });

  /* 轻提示 */
  let toastEl = null, toastTimer = null;
  const toast = (msg) => {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  };

  const fmtTime = (t) => {
    const d = new Date(typeof t === "number" ? t : Date.parse(t));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  let userQuery = "";

  const root = $("#admRoot");

  /* ---------- 登录 ---------- */
  function renderLogin() {
    $("#admLogout").hidden = true;
    root.innerHTML = `
      <div class="adm-card adm-login">
        <h3 style="margin:0 0 16px">管理员登录</h3>
        <form id="admForm">
          <input id="admUser" placeholder="管理员用户名" required autocomplete="username">
          <div class="pw-wrap">
            <input id="admPass" type="password" placeholder="密码" required autocomplete="current-password">
            <button type="button" class="pw-eye" data-for="admPass" aria-label="显示密码">👁</button>
          </div>
          <p class="auth-err" id="admErr"></p>
          <button class="btn btn-primary" style="width:100%">登录管理后台</button>
        </form>
      </div>`;
    $$(".pw-eye", root).forEach((eye) => {
      eye.addEventListener("click", () => {
        const input = $("#" + eye.dataset.for);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        eye.textContent = show ? "🙈" : "👁";
        input.focus();
      });
    });
    $("#admForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const resp = await fetch("/api/admin/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: $("#admUser").value.trim(), password: $("#admPass").value }),
        });
        const data = await resp.json();
        if (!resp.ok) { $("#admErr").textContent = data.error || "登录失败"; return; }
        toast("已登录管理后台");
        renderDash();
      } catch { $("#admErr").textContent = "无法连接后端服务"; }
    });
  }

  /* ---------- 控制台 ---------- */
  async function renderDash() {
    $("#admLogout").hidden = false;
    let ov, users, topics, stats, cats;
    try {
      [ov, users, topics, stats, cats] = await Promise.all([
        fetch("/api/admin/overview").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/topics").then((r) => r.json()),
        fetch("/api/admin/stats").then((r) => r.json()),
        fetch("/api/categories").then((r) => r.json()),
      ]);
    } catch {
      root.innerHTML = '<div class="adm-card">无法连接后端服务。</div>';
      return;
    }

    const maxDay = Math.max(1, ...stats.days.map((d) => d.count));
    const pageRows = Object.entries(stats.pages).sort((a, b) => b[1] - a[1]).slice(0, 5);

    root.innerHTML = `
      <div class="adm-stats">
        <div class="adm-stat"><b>${stats.total}</b><span>总访问量</span></div>
        <div class="adm-stat"><b>${stats.today}</b><span>今日访问</span></div>
        <div class="adm-stat"><b>${ov.users}</b><span>注册用户</span></div>
        <div class="adm-stat"><b>${ov.topics}</b><span>用户话题</span></div>
        <div class="adm-stat"><b>${ov.replies}</b><span>用户回复</span></div>
      </div>

      <div class="adm-card">
        <h3 style="margin:0 0 14px">访问趋势（近 14 天）</h3>
        <div class="adm-trend">
          ${stats.days.map((d) => `
          <div class="adm-trend-col" title="${d.day}：${d.count} 次">
            <span class="adm-trend-n">${d.count || ""}</span>
            <div class="adm-trend-bar" style="height:${Math.max(4, Math.round(d.count / maxDay * 90))}px"></div>
            <span class="adm-trend-d">${d.day.slice(5)}</span>
          </div>`).join("")}
        </div>
        <p style="color:var(--muted);font-size:12.5px;margin:14px 0 0">页面分布：${pageRows.map(([p, n]) => `${esc(p)} ${n} 次`).join(" · ") || "暂无"}</p>
      </div>

      <div class="adm-card">
        <div class="adm-card-head">
          <h3 style="margin:0">年级分类</h3>
        </div>
        <p style="color:var(--muted);font-size:12.5px;margin:0 0 10px">
          当前生效的年级（基础配置 ∪ 已注册用户的年级）：
          ${cats.map((c) => `<span class="chip cat" style="margin-right:6px"><span class="cat-dot" style="background:${c.color}"></span>${c.label}</span>`).join("")}
        </p>
        <div style="display:flex;gap:10px;align-items:center">
          <input id="catYears" placeholder="输入基础年级，逗号分隔，如 2018, 2019, 2020" value="${cats.map((c) => c.id).join(", ")}" style="margin:0">
          <button class="btn btn-primary" id="catSave" style="white-space:nowrap">保存</button>
        </div>
      </div>

      <div class="adm-card">
        <div class="adm-card-head">
          <h3 style="margin:0">用户管理（<span id="userCount"></span>）</h3>
          <input id="admSearch" placeholder="搜索昵称 / 邮箱 / 标签 / 年级" value="${esc(userQuery)}">
        </div>
        <div id="userTable"></div>
      </div>

      <div class="adm-card">
        <h3 style="margin:0 0 12px">话题管理（${topics.length}，仅用户发布的话题）</h3>
        ${topics.length ? `<table class="adm-table">
          <tr><th>标题</th><th>作者</th><th>分类</th><th>发布时间</th><th>操作</th></tr>
          ${topics.map((t) => `
          <tr>
            <td>${t.pinned ? "📌 " : ""}<a href="topic.html?id=${t.id}" style="color:var(--accent-strong)">${esc(t.title)}</a></td>
            <td>${esc(t.author)}</td>
            <td>${CATS[t.category] || t.category}</td>
            <td>${fmtTime(t.created)}</td>
            <td>
              <button class="act-btn" data-pin="${t.id}">${t.pinned ? "取消置顶" : "置顶"}</button>
              <button class="act-btn link-danger" data-del-topic="${t.id}">删除</button>
            </td>
          </tr>`).join("")}
        </table>` : '<p style="color:var(--muted)">用户还没有发布话题（内置示例话题不在此列）。</p>'}
      </div>`;

    /* 年级分类保存 */
    $("#catSave", root).addEventListener("click", async () => {
      const years = $("#catYears", root).value.split(/[\s,，]+/).filter(Boolean).map(Number).filter((y) => y >= 1990 && y <= 2026);
      if (!years.length) { toast("请填写有效的年级（1990–2026）"); return; }
      const r = await fetch("/api/admin/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ years }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || "保存失败"); return; }
      toast("年级分类已保存");
      renderDash();
    });

    /* 用户搜索：按昵称/邮箱/标签/年级过滤（只重绘表格，不整页刷新） */
    const searchBox = $("#admSearch", root);
    searchBox.addEventListener("input", () => {
      userQuery = searchBox.value;
      renderUsers(users);
    });
    renderUsers(users);

    $$("[data-pin]", root).forEach((b) => b.addEventListener("click", async () => {
      const r = await fetch(`/api/admin/topics/${b.dataset.pin}/pin`, { method: "POST" });
      if (r.ok) { toast("已更新置顶状态"); renderDash(); } else toast((await r.json()).error || "操作失败");
    }));
    $$("[data-del-topic]", root).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("确定删除该话题及其全部回复？")) return;
      const r = await fetch("/api/admin/topics/" + b.dataset.delTopic, { method: "DELETE" });
      if (r.ok) { toast("已删除"); renderDash(); } else toast((await r.json()).error || "操作失败");
    }));
  }

  /* ---------- 用户表格（含搜索过滤） ---------- */
  function renderUsers(users) {
    const box = $("#userTable");
    if (!box) return;
    const q = userQuery.trim().toLowerCase();
    const list = q ? users.filter((u) =>
      u.nickname.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.tags || []).join(" ").toLowerCase().includes(q) ||
      String(u.grade || "").includes(q)) : users;
    $("#userCount").textContent = `${list.length}/${users.length}`;

    box.innerHTML = list.length ? `<table class="adm-table">
      <tr><th>ID</th><th>昵称</th><th>邮箱</th><th>入学年级</th><th>标签</th><th>注册时间</th><th>操作</th></tr>
      ${list.map((u) => `
      <tr>
        <td>${u.id}</td>
        <td><span class="avatar" style="--c:${u.color};width:22px;height:22px;font-size:11px;display:inline-flex;vertical-align:-5px;margin-right:6px">${esc(u.nickname[0])}</span>${esc(u.nickname)}${u.role === "admin" ? ' <span class="p-op-badge">管理员</span>' : ""}</td>
        <td>${esc(u.email)}</td>
        <td>${u.grade ? u.grade + " 级" : "—"}</td>
        <td>${(u.tags || []).length ? u.tags.map((t) => `<span class="chip" style="margin-right:4px">${esc(t)}</span>`).join("") : "—"}</td>
        <td>${fmtTime(u.createdAt)}</td>
        <td>
          <button class="act-btn" data-edit-user="${u.id}">编辑</button>
          ${u.role !== "admin" ? `<button class="act-btn" data-reset-pw="${u.id}">重置密码</button>` : ""}
          ${u.role !== "admin" ? `<button class="act-btn link-danger" data-del-user="${u.id}">删除</button>` : ""}
        </td>
      </tr>`).join("")}
    </table>` : `<p style="color:var(--muted)">${q ? "没有匹配「" + esc(userQuery) + "」的用户。" : "还没有用户注册。"}</p>`;

    $$("[data-edit-user]", box).forEach((b) => b.addEventListener("click", () =>
      openEditUser(users.find((u) => u.id === +b.dataset.editUser))));
    $$("[data-reset-pw]", box).forEach((b) => b.addEventListener("click", () =>
      openResetPw(users.find((u) => u.id === +b.dataset.resetPw))));
    $$("[data-del-user]", box).forEach((b) => b.addEventListener("click", async () => {
      const u = users.find((x) => x.id === +b.dataset.delUser);
      if (!confirm(`删除用户「${u.nickname}」将同时删除其全部话题与回复，确定？`)) return;
      const r = await fetch("/api/admin/users/" + u.id, { method: "DELETE" });
      if (r.ok) { toast("已删除"); renderDash(); } else toast((await r.json()).error || "操作失败");
    }));
  }

  /* ---------- 重置密码：默认 123456 可修改 + 二次确认 ---------- */
  function openResetPw(u) {
    let m = document.querySelector("#pwMask");
    if (m) m.remove();
    m = document.createElement("div");
    m.className = "modal-mask open";
    m.id = "pwMask";
    m.innerHTML = `
      <form class="modal" id="pwForm">
        <h3>重置密码 · ${esc(u.nickname)}</h3>
        <div class="field"><label>新密码（默认 123456，可修改，至少 6 位）</label>
          <input id="pwVal" minlength="6" value="123456" required></div>
        <p class="auth-err" id="pwErr"></p>
        <div class="foot">
          <button type="button" class="btn btn-ghost" id="pwCancel">取消</button>
          <button type="submit" class="btn btn-primary">下一步</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    m.querySelector("#pwVal").select();
    m.querySelector("#pwCancel").addEventListener("click", () => m.remove());
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    m.querySelector("#pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = m.querySelector("#pwVal").value;
      if (!confirm(`二次确认：确定将「${u.nickname}」的密码重置为「${pw}」吗？\n重置后该用户将在所有设备退出登录。`)) return;
      const r = await fetch(`/api/admin/users/${u.id}/password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const d = await r.json();
      if (!r.ok) { m.querySelector("#pwErr").textContent = d.error || "操作失败"; return; }
      m.remove();
      toast(`已将 ${u.nickname} 的密码重置为 ${pw}`);
    });
  }

  /* ---------- 用户编辑弹窗（昵称 / 年级 / 标签） ---------- */
  function openEditUser(u) {
    let gradeOpts = '<option value="">未设置</option>';
    for (let y = 2026; y >= 1990; y--) {
      gradeOpts += `<option value="${y}" ${u.grade === y ? "selected" : ""}>${y} 级</option>`;
    }
    let m = document.querySelector("#editMask");
    if (m) m.remove();
    m = document.createElement("div");
    m.className = "modal-mask open";
    m.id = "editMask";
    m.innerHTML = `
      <form class="modal" id="editForm">
        <h3>编辑用户 · ${esc(u.nickname)}</h3>
        <div class="field"><label>昵称</label><input id="eNick" maxlength="12" value="${esc(u.nickname)}" required></div>
        <div class="field"><label>入学年级</label><select id="eGrade">${gradeOpts}</select></div>
        <div class="foot">
          <button type="button" class="btn btn-ghost" id="eCancel">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    m.querySelector("#eCancel").addEventListener("click", () => m.remove());
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    m.querySelector("#editForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: m.querySelector("#eNick").value.trim(),
          grade: m.querySelector("#eGrade").value || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || "保存失败"); return; }
      m.remove();
      toast("已保存");
      renderDash();
    });
  }

  $("#admLogout").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    renderLogin();
  });

  (async () => {
    let admin = false;
    try { admin = (await (await fetch("/api/admin/me")).json()).admin; } catch {}
    admin ? renderDash() : renderLogin();
  })();
})();
