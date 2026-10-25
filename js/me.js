/* ============================================================
 * 风华正茂 —— 个人中心（我的资料 / 我的话题 / 我的回复）
 * ============================================================ */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  /* 主题切换（与主站一致的本地记忆） */
  $("#btnTheme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      const s = JSON.parse(localStorage.getItem("sjforum.v1")) || {};
      s.theme = next;
      localStorage.setItem("sjforum.v1", JSON.stringify(s));
    } catch {}
  });

  document.title = "个人中心 · 风华正茂";
  const root = $("#meRoot");

  let toastEl = null, toastTimer = null;
  const toast = (msg) => {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  };

  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return "刚刚";
    if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
    if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
    const d = new Date(ts);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const catById = (id) => DATA.categories.find((c) => c.id === +id);

  async function init() {
    const me = window.AUTH.user;
    if (!me) {
      root.innerHTML = `
        <div class="me-card me-login-hint">
          <p>登录后可以在这里查看你发布的话题和回复。</p>
          <button class="btn btn-primary" id="goLogin">去登录</button>
        </div>`;
      $("#goLogin").addEventListener("click", () => window.openAuth("login"));
      return;
    }

    let topics = [], replies = [], allTopics = [], favIds = [];
    try {
      [topics, replies, allTopics, favIds] = await Promise.all([
        fetch("/api/me/topics").then((r) => r.json()),
        fetch("/api/me/replies").then((r) => r.json()),
        fetch("/api/topics").then((r) => r.json()),
        fetch("/api/me/favorites").then((r) => r.json()),
      ]);
    } catch {
      root.innerHTML = '<div class="me-card">无法连接后端服务。</div>';
      return;
    }
    if (!Array.isArray(topics)) topics = [];
    if (!Array.isArray(replies)) replies = [];
    if (!Array.isArray(favIds)) favIds = [];

    const topicById = (tid) =>
      allTopics.find((t) => String(t.id) === String(tid)) ||
      DATA.topics.find((t) => String(t.id) === String(tid));

    /* 收藏自愈：帖子已被删除的收藏 ID 过滤掉，并回写服务端保持计数一致 */
    const validFavs = favIds.filter((tid) => topicById(tid));
    if (validFavs.length !== favIds.length) {
      try {
        await fetch("/api/me/favorites", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ set: validFavs }),
        });
      } catch {}
    }

    const titleOf = (tid) => {
      const local = DATA.topics.find((t) => String(t.id) === String(tid));
      const server = allTopics.find((t) => String(t.id) === String(tid));
      return (server && server.title) || (local && local.title) || "（话题已删除）";
    };

    root.innerHTML = `
      <div class="me-profile">
        <span class="avatar avatar-lg" style="--c:${me.color}">${esc(me.nickname[0])}</span>
        <div class="me-pinfo">
          <h2>${esc(me.nickname)}
            ${me.role === "admin" ? '<span class="p-op-badge">管理员</span>' : ""}
          </h2>
          <p class="me-meta">
            ${esc(me.email)} · ${me.grade ? me.grade + " 级入学" : "未设置年级"} ·
            加入于 ${relTime(me.createdAt)}前
          </p>
        </div>
      </div>

      <div class="list-tabs me-tabs">
        <button class="on" data-t="topics">我发布的（${topics.length}）</button>
        <button data-t="replies">我的回复（${replies.length}）</button>
        <button data-t="favs">我的收藏（${validFavs.length}）</button>
      </div>

      <div id="meTopics" class="me-panel"></div>
      <div id="meReplies" class="me-panel" hidden></div>
      <div id="meFavs" class="me-panel" hidden></div>`;

    function renderTopics() {
      $("#meTopics").innerHTML = topics.length ? topics.map((t) => {
        const c = catById(t.category);
        return `
        <div class="me-row">
          <div class="me-row-main">
            <a class="me-row-title" href="topic.html?id=${t.id}">${esc(t.title)}</a>
            <div class="t-badges">
              <span class="chip cat"><span class="cat-dot" style="background:${c ? c.color : "#888"}"></span>${c ? c.label : t.category}</span>
              ${t.tags.map((g) => `<span class="chip"># ${esc(g)}</span>`).join("")}
              <span class="me-row-time">${relTime(t.created)}</span>
            </div>
          </div>
          <button class="act-btn link-danger" data-del-topic="${t.id}">删除</button>
        </div>`;
      }).join("") : '<p class="me-empty">还没有发布过帖子，<a href="index.html" style="color:var(--accent)">去写第一篇</a>。</p>';

      $$("#meTopics [data-del-topic]").forEach((b) => b.addEventListener("click", async () => {
        if (!(await window.confirmDialog("确定删除这个帖子及其全部评论？"))) return;
        const r = await fetch("/api/topics/" + b.dataset.delTopic, { method: "DELETE" });
        const d = await r.json();
        if (!r.ok) { toast(d.error || "删除失败"); return; }
        toast("已删除");
        init();
      }));
    }

    function renderReplies() {
      $("#meReplies").innerHTML = replies.length ? replies.map((r) => `
        <div class="me-row">
          <div class="me-row-main">
            <p class="me-reply-text">${esc(r.text)}</p>
            <div class="t-badges">
              <span class="chip">回复于 <a href="topic.html?id=${r.topicId}" style="color:var(--accent-strong)">${esc(titleOf(r.topicId))}</a></span>
              <span class="me-row-time">${relTime(r.time)}</span>
            </div>
          </div>
          <button class="act-btn link-danger" data-del-reply="${r.topicId}/${r.id}">删除</button>
        </div>`).join("") : '<p class="me-empty">还没有回复过别人的话题。</p>';

      $$("#meReplies [data-del-reply]").forEach((b) => b.addEventListener("click", async () => {
        if (!(await window.confirmDialog("确定删除这条评论？"))) return;
        const [tid, rid] = b.dataset.delReply.split("/");
        const r = await fetch(`/api/replies/${encodeURIComponent(tid)}/${encodeURIComponent(rid)}`, { method: "DELETE" });
        const d = await r.json();
        if (!r.ok) { toast(d.error || "删除失败"); return; }
        toast("已删除");
        init();
      }));
    }

    function renderFavs() {
      $("#meFavs").innerHTML = validFavs.length ? validFavs.map((tid) => {
        const t = topicById(tid);
        if (!t) return "";
        const c = catById(t.category);
        return `
        <div class="me-row">
          <div class="me-row-main">
            <a class="me-row-title" href="topic.html?id=${t.id}">${esc(t.title)}</a>
            <div class="t-badges">
              <span class="chip cat"><span class="cat-dot" style="background:${c ? c.color : "#888"}"></span>${c ? c.label : t.category}</span>
              <span class="chip">${esc(t.author)}</span>
            </div>
          </div>
          <button class="act-btn link-danger" data-unfav="${t.id}">取消收藏</button>
        </div>`;
      }).join("") : '<p class="me-empty">还没有收藏话题。看到喜欢的故事，点「☆ 收藏」就会出现在这里。</p>';

      $$("#meFavs [data-unfav]").forEach((b) => b.addEventListener("click", async () => {
        const r = await fetch(`/api/topics/${encodeURIComponent(b.dataset.unfav)}/favorite`, { method: "POST" });
        if (r.ok) { toast("已取消收藏"); init(); }
        else toast((await r.json()).error || "操作失败");
      }));
    }

    renderTopics();
    renderReplies();
    renderFavs();

    $$(".me-tabs button", root).forEach((b) => b.addEventListener("click", () => {
      $$(".me-tabs button", root).forEach((x) => x.classList.toggle("on", x === b));
      $("#meTopics").hidden = b.dataset.t !== "topics";
      $("#meReplies").hidden = b.dataset.t !== "replies";
      $("#meFavs").hidden = b.dataset.t !== "favs";
    }));
  }

  /* 等 auth.js 拿到登录态再渲染 */
  const waitAuth = setInterval(() => {
    if (window.AUTH && window.AUTH.__inited) { clearInterval(waitAuth); init(); }
  }, 120);
  setTimeout(() => { clearInterval(waitAuth); if (!root.innerHTML) init(); }, 2500);
})();
