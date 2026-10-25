/* ============================================================
 * 风华正茂 · 论坛版 —— 渲染与交互
 * 话题与回复走服务端 API；点赞/主题等偏好存本机 localStorage
 * ============================================================ */
(function () {
  "use strict";

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const catById = (id) => (window.CATS || DATA.categories).find((c) => c.id === +id);
  const loadCats = async () => {
    try { window.CATS = await (await fetch("/api/categories")).json(); } catch {}
  };

  /* ---------- 本机存储 ---------- */
  const STORE_KEY = "sjforum.v1";
  const loadStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  };
  const saveStore = (s) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
  };
  function storeUpdate(fn) {
    const s = loadStore();
    fn(s);
    saveStore(s);
  }

  /* 主题（深/浅） */
  document.documentElement.dataset.theme = loadStore().theme || "dark";

  /* ---------- 通用 ---------- */
  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return "刚刚";
    if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
    if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
    if (diff < 172800e3) return "昨天";
    const d = new Date(ts);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  const fmtTime = (t) => (typeof t === "number" ? relTime(t) : t);
  const tsOf = (t) => (typeof t === "number" ? t : Date.parse(t));
  function ageOf(t) {
    const diff = Date.now() - tsOf(t);
    const day = 86400e3;
    if (diff < day) return "今天";
    if (diff < 2 * day) return "昨天";
    if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
    if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} 个月前`;
    return `${Math.floor(diff / (365 * day))} 年前`;
  }
  const avatar = (name, color, cls) =>
    `<span class="avatar ${cls || ""}" style="--c:${color}">${esc(name[0])}</span>`;
  const catChip = (cid) => {
    const c = catById(cid);
    return `<span class="chip cat"><span class="cat-dot" style="background:${c.color}"></span>${c.label}</span>`;
  };
  const tagChips = (tags) =>
    tags.map((t) => `<span class="chip"># ${esc(t)}</span>`).join("");

  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }
  window.toast = toast;

  /* 灯箱 */
  const lb = document.createElement("div");
  lb.className = "lb";
  lb.innerHTML = '<button class="lb-close" aria-label="关闭">✕</button><img alt=""><p class="lb-cap"></p>';
  document.body.appendChild(lb);
  lb.addEventListener("click", (e) => {
    if (e.target.tagName !== "IMG") lb.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { lb.classList.remove("open"); $$(".pop").forEach((p) => p.classList.remove("open")); }
  });
  document.addEventListener("click", (e) => {
    const img = e.target.closest(".p-images img");
    if (img) {
      lb.querySelector("img").src = img.src;
      lb.querySelector(".lb-cap").textContent = img.dataset.cap || img.alt || "";
      lb.classList.add("open");
    }
  });

  /* ---------- 数据合成 ---------- */
  const allTopics = () => DATA.topics.concat(window.SERVER_TOPICS || []);
  const findTopic = (id) => allTopics().find((t) => String(t.id) === String(id));
  const repliesOf = (t) => (t.replies || [])
    .concat(((window.SERVER_REPLIES || {})[t.id] || []).map((r) => ({ ...r, user: r.nickname })));
  function lastActivity(t) {
    const rs = repliesOf(t);
    return rs.length ? tsOf(rs[rs.length - 1].time) : tsOf(t.created);
  }
  function viewCount(t) {
    return (t.views || 0) + ((loadStore().views || {})[t.id] || 0);
  }

  /* ---------- 进入页 ---------- */
  const enter = $("#enter");
  if (enter) {
    if (sessionStorage.getItem("sj-entered")) {
      enter.remove();
    } else {
      document.body.style.overflow = "hidden";
      enter.addEventListener("click", () => {
        sessionStorage.setItem("sj-entered", "1");
        enter.classList.add("hide");
        document.body.style.overflow = "";
        setTimeout(() => enter.remove(), 700);
      });
    }
  }

  /* ---------- 右侧栏（bbs-go 风格：用户卡 / 作者卡 / 站点统计 / 新同学） ---------- */
  async function renderRail(opt) {
    opt = opt || {};
    const rail = $("#rail");
    if (!rail) return;
    let stats = null;
    try { stats = await (await fetch("/api/site/stats")).json(); } catch {}

    let html = "";
    const me = window.AUTH && window.AUTH.user;
    if (me) {
      let my = { t: 0, r: 0 };
      try {
        const [ts, rs] = await Promise.all([
          fetch("/api/me/topics").then((r) => r.json()),
          fetch("/api/me/replies").then((r) => r.json()),
        ]);
        if (Array.isArray(ts)) my.t = ts.length;
        if (Array.isArray(rs)) my.r = rs.length;
      } catch {}
      html += `
      <div class="rail-card">
        <div class="rail-user-head">
          ${avatar(me.nickname, me.color)}
          <div><b>${esc(me.nickname)}</b><span>${me.grade ? me.grade + " 级入学" : "未设置年级"}</span></div>
        </div>
        <div class="rail-user-stats">
          <div><b>${my.t}</b><span>话题</span></div>
          <div><b>${my.r}</b><span>回复</span></div>
        </div>
        <div class="rail-btns">
          <a class="btn btn-ghost" href="me.html">👤 个人中心</a>
          <a class="btn btn-ghost" href="messages.html">✉ 私信</a>
          ${me.role === "admin" ? '<a class="btn btn-ghost" href="admin.html">⚙ 管理后台</a>' : ""}
        </div>
      </div>`;
    } else {
      html += `
      <div class="rail-card" style="text-align:center">
        <h4>未登录</h4>
        <p style="color:var(--muted);font-size:13px;margin:0 0 12px">登录后可以发布话题、回复同学的故事</p>
        <button class="btn btn-primary" style="width:100%" onclick="openAuth('login')">去登录</button>
      </div>`;
    }

    if (opt.author) {
      const a = opt.author;
      html += `
      <div class="rail-card">
        <h4>作者</h4>
        <div class="rail-user-head">
          ${avatar(a.author, a.color)}
          <div><b>${esc(a.author)}</b><span>${catById(a.category) ? catById(a.category).label : ""}</span></div>
        </div>
        <p style="color:var(--muted);font-size:12.5px;margin:0 0 4px">发布于 ${fmtTime(a.created)}</p>
        ${a.uid ? `<div class="rail-btns" style="margin-top:8px">
          <a class="btn btn-ghost" href="messages.html?to=${a.uid}">✉ 私信作者</a>
        </div>` : ""}
      </div>`;
    }

    if (stats) {
      html += `
      <div class="rail-card">
        <h4>站点统计</h4>
        <div class="stat-grid">
          <div><b>${DATA.topics.length + stats.topics}</b><span>话题</span></div>
          <div><b>${stats.replies}</b><span>回复</span></div>
          <div><b>${stats.users}</b><span>用户</span></div>
          <div><b>${stats.views}</b><span>访问量</span></div>
        </div>
      </div>
      <div class="rail-card">
        <h4>新加入的同学</h4>
        ${stats.recentUsers.map((u) => `
          <div class="active-user">
            ${avatar(u.nickname, u.color)}
            <span>${esc(u.nickname)}</span>
            <small>${u.grade ? u.grade + " 级" : (u.role === "admin" ? "站长" : "")}</small>
          </div>`).join("") || '<p style="color:var(--muted);font-size:13px;margin:0">暂无</p>'}
      </div>`;
    }

    rail.innerHTML = html;
  }
  window.__renderRail = renderRail;

  /* ---------- 公共区块 ---------- */
  const page = document.body.dataset.page;

  /* 侧栏（两页共用） */
  function renderSidebar(activeCat, activeTag) {
    const topics = allTopics();
    const catCount = (cid) => topics.filter((t) => t.category === cid).length;
    const tags = {};
    topics.forEach((t) => t.tags.forEach((g) => { tags[g] = (tags[g] || 0) + 1; }));
    $("#sideTopics").innerHTML = `
      <a class="side-item ${!activeCat && !activeTag ? "active" : ""}" href="index.html">📋 全部话题</a>
      <a class="side-item" data-act="new">✏️ 发布帖子</a>`;
    $("#sideCats").innerHTML = (window.CATS || DATA.categories).map((c) => `
      <a class="side-item ${activeCat === c.id ? "active" : ""}" href="index.html?cat=${c.id}">
        <span class="cat-dot" style="background:${c.color}"></span>${c.label}
        <span class="cnt">${catCount(c.id)}</span>
      </a>`).join("");
    $("#sideTags").innerHTML = Object.entries(tags).map(([g, n]) => `
      <a class="side-item ${activeTag === g ? "active" : ""}" href="index.html?tag=${encodeURIComponent(g)}">
        <span class="tag-ic">#</span>${esc(g)}<span class="cnt">${n}</span>
      </a>`).join("");
  }

  /* 顶栏行为：搜索 / 主题切换 / 登录占位 / 抽屉 */
  function bindTopbar() {
    const input = $("#searchInput");
    if (input) {
      if (qs("q")) input.value = qs("q");
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && page === "index") input.dispatchEvent(new Event("input"));
      });
    }
    $("#btnTheme").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      storeUpdate((s) => { s.theme = next; });
    });
    /* 登录 / 注册按钮由 auth.js 渲染并绑定 */
    $("#btnMenu").addEventListener("click", () =>
      document.body.classList.toggle("side-open"));
  }
  bindTopbar();

  /* 发布帖子 → 独立页面（post.html），不再使用首页弹窗 */
  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="new"]') || e.target.closest("#btnNew")) {
      e.preventDefault();
      location.href = "post.html";
    }
  });

  /* ============ 列表页 ============ */
  if (page === "index") (async () => {
    await loadCats();
    try { window.SERVER_TOPICS = await (await fetch("/api/topics")).json(); } catch {}
    let sort = qs("sort") || "latest";
    let fCat = +qs("cat") || null;
    let fTag = qs("tag") || null;

    renderSidebar(fCat, fTag);

    /* 筛选提示行 */
    function renderFilterNote() {
      const note = $("#filterNote");
      if (!fCat && !fTag && !($("#searchInput").value.trim())) { note.innerHTML = ""; return; }
      const catName = fCat ? catById(fCat).label : null;
      note.innerHTML = `筛选：<b>${[catName, fTag && "#" + fTag, $("#searchInput").value.trim() && "“" + $("#searchInput").value.trim() + "”"].filter(Boolean).join(" · ")}</b>
        <button id="clearFilter">清除</button>`;
      $("#clearFilter").addEventListener("click", () => {
        fCat = null; fTag = null; $("#searchInput").value = "";
        history.replaceState(null, "", "index.html");
        renderSidebar(null, null);
        renderList();
        renderFilterNote();
      });
    }

    function renderList() {
      const q = $("#searchInput").value.trim().toLowerCase();
      let list = allTopics();
      if (fCat) list = list.filter((t) => t.category === fCat);
      if (fTag) list = list.filter((t) => t.tags.includes(fTag));
      if (q) {
        list = list.filter((t) =>
          t.title.toLowerCase().includes(q) ||
          t.body.join(" ").toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q) ||
          repliesOf(t).some((r) => r.text.toLowerCase().includes(q)));
      }
      const pinned = list.filter((t) => t.pinned);
      const rest = list.filter((t) => !t.pinned);
      if (sort === "latest") {
        rest.sort((a, b) => lastActivity(b) - lastActivity(a));
      } else {
        rest.sort((a, b) =>
          (b.likes + repliesOf(b).length * 3) - (a.likes + repliesOf(a).length * 3));
      }
      list = pinned.concat(rest);

      $("#topicList").innerHTML = list.length ? list.map((t) => {
        const rs = repliesOf(t);
        return `
        <div class="topic-row trow" data-id="${t.id}">
          ${avatar(t.author, t.color)}
          <div class="trow-main">
            <p class="trow-title">${t.pinned ? '<span class="pin-badge">📌 置顶</span>' : ""}${esc(t.title)}</p>
            <p class="trow-excerpt">${esc((t.body[0] || "").slice(0, 80))}</p>
            <div class="trow-meta">
              ${catChip(t.category)}${tagChips(t.tags)}
              <span class="dot">·</span><span>${esc(t.author)}</span>
              <span class="dot">·</span><span>${ageOf(lastActivity(t))}</span>
              <span class="trow-nums">
                <span title="浏览">👁 <b>${viewCount(t)}</b></span>
                <span title="回复">💬 <b>${rs.length}</b></span>
                <span title="点赞">❤ <b>${t.likes}</b></span>
              </span>
            </div>
          </div>
        </div>`;
      }).join("") : `<div class="empty-list">没有匹配的话题——换一个词，或者<a href="#" data-act="new" style="color:var(--accent)">发布第一篇</a>。</div>`;

      $$(".topic-row").forEach((row) =>
        row.addEventListener("click", () =>
          location.href = "topic.html?id=" + row.dataset.id));
    }

    /* 排序 Tab */
    $$(".list-tabs button").forEach((b) => {
      b.classList.toggle("on", b.dataset.sort === sort);
      b.addEventListener("click", () => {
        sort = b.dataset.sort;
        $$(".list-tabs button").forEach((x) => x.classList.toggle("on", x === b));
        renderList();
      });
    });

    /* 分类/标签下拉 */
    $$(".list-tools .pill").forEach((pill) => {
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        const pop = pill.parentElement.querySelector(`.pop[data-for="${pill.dataset.pop}"]`);
        const kind = pill.dataset.pop;
        const topics = allTopics();
        if (kind === "cat") {
          pop.innerHTML = DATA.categories.map((c) =>
            `<button class="side-item" data-v="${c.id}"><span class="cat-dot" style="background:${c.color}"></span>${c.label}</button>`).join("");
        } else {
          const tags = {};
          topics.forEach((t) => t.tags.forEach((g) => { tags[g] = (tags[g] || 0) + 1; }));
          pop.innerHTML = Object.entries(tags).map(([g, n]) =>
            `<button class="side-item" data-v="${esc(g)}"><span class="tag-ic">#</span>${esc(g)}<span class="cnt">${n}</span></button>`).join("");
        }
        pop.classList.toggle("open");
        $$("button", pop).forEach((b) => b.addEventListener("click", () => {
          if (kind === "cat") fCat = +b.dataset.v; else fTag = b.dataset.v;
          pop.classList.remove("open");
          renderList();
          renderFilterNote();
          renderSidebar(fCat, fTag);
        }));
      });
    });
    document.addEventListener("click", () => $$(".pop").forEach((p) => p.classList.remove("open")));

    const searchInput = $("#searchInput");
    searchInput.addEventListener("input", () => { renderList(); renderFilterNote(); });

    renderList();
    renderFilterNote();
    renderRail();
    setTimeout(renderRail, 900); /* 等 auth.js 就绪后刷新用户卡 */
  })();

  /* ============ 话题页 ============ */
  if (page === "topic") (async () => {
    const root = $("#topicRoot");
    await loadCats();
    try {
      window.SERVER_TOPICS = await (await fetch("/api/topics")).json();
      window.SERVER_REPLIES = window.SERVER_REPLIES || {};
      window.SERVER_REPLIES[qs("id")] = await (await fetch("/api/topics/" + encodeURIComponent(qs("id")) + "/replies")).json();
    } catch {}
    const t = findTopic(qs("id"));
    if (!t) {
      root.innerHTML = `<div class="empty-list">没有找到这个话题。<br><br><a class="btn btn-primary" href="index.html">回到话题列表</a></div>`;
      renderSidebar(null, null);
    } else {
      storeUpdate((s) => { s.views = s.views || {}; s.views[t.id] = (s.views[t.id] || 0) + 1; });

      renderSidebar(t.category, null);
      document.title = `${t.title} · ${DATA.site.name}`;

      const likeKey = (i) => (i < 0 ? "op" : "r" + i);
      function likesFor(topic, i) {
        const base = i < 0 ? topic.likes : repliesOf(topic)[i].likes;
        const mine = (loadStore().likes || {})[topic.id] || {};
        return base + (mine[likeKey(i)] ? 1 : 0);
      }

      function render() {
        const rs = repliesOf(t);
        const cat = catById(t.category);
        /* 楼中楼：稳定 _id（服务端回复用 id，内置示例用 b+序号），按 parentId 归组到顶层楼层 */
        rs.forEach((r, i) => { r._id = r.id || "b" + i; r._idx = i; });
        const parentOf = {};
        rs.forEach((r) => {
          const p = r.parentId && rs.find((x) => x._id === r.parentId && x._id !== r._id);
          r._parent = p ? p._id : null;
          parentOf[r._id] = p ? (parentOf[p._id] || p._id) : null;
        });
        const kids = {};
        const tops = [];
        rs.forEach((r) => {
          const topId = parentOf[r._id];
          if (topId) (kids[topId] = kids[topId] || []).push(r);
          else tops.push(r);
        });
        const nickOf = (rid) => (rs.find((x) => x._id === rid) || {}).user || "";

        const replyPostHTML = (r, isChild) => `
            <div class="post${isChild ? " child" : ""}" data-rid="${r._id}">
              <div class="p-left">${avatar(r.user, r.color)}<span class="p-name">${esc(r.user)}</span></div>
              <div class="p-body">
                <div class="p-head">
                  <b>${esc(r.user)}</b>
                  ${isChild && r._parent ? `<span class="reply-to">↩ ${esc(nickOf(r._parent) || "")}</span>` : ""}
                  <time>${fmtTime(r.time)}</time>
                </div>
                <p class="p-text">${esc(r.text)}</p>
                <div class="p-actions">
                  <button class="act-btn act-like" data-k="${likeKey(r._idx)}">❤ <b>${likesFor(t, r._idx)}</b></button>
                  <button class="act-btn act-reply" data-rid="${r._id}" data-nick="${esc(r.user)}">💬 回复</button>
                  ${isChild ? "" : `<span class="p-floor">#${r._idx + 2}</span>`}
                </div>
              </div>
            </div>
            <div class="rbox-slot" data-slot="${r._id}"></div>
            ${(kids[r._id] || []).map((c) => replyPostHTML(c, true)).join("")}`;

        root.innerHTML = `
          <header class="topic-head">
            <h1>${t.pinned ? "📌 " : ""}${esc(t.title)}</h1>
            <div class="t-badges">${catChip(t.category)}${tagChips(t.tags)}</div>
            <div class="topic-meta">
              ${avatar(t.author, t.color)}<b>${esc(t.author)}</b>
              <span>发布于 ${fmtTime(t.created)}</span>
              <span>· ${rs.length + 1} 条回复</span><span>· ${viewCount(t)} 次浏览</span>
            </div>
            <div class="topic-actions" id="topicActions"></div>
          </header>
          <div class="post-list">
            <div class="post">
              <div class="p-left">${avatar(t.author, t.color)}<span class="p-name">${esc(t.author)}</span></div>
              <div class="p-body">
                <div class="p-head"><b>${esc(t.author)}</b><span class="p-op-badge">楼主</span><time>${fmtTime(t.created)}</time></div>
                ${t.body.map((p) => `<p class="p-text">${esc(p)}</p>`).join("")}
                ${t.images.length ? `<div class="p-images">${t.images.map((m) => `
                  <figure><img src="${m.src}" alt="${esc(m.caption)}" data-cap="${esc(m.caption)}" loading="lazy"><figcaption>${esc(m.caption)}</figcaption></figure>`).join("")}</div>` : ""}
                <div class="p-actions">
                  <button class="act-btn act-like" data-k="op">❤ <b>${likesFor(t, -1)}</b></button>
                  <button class="act-btn act-reply" data-rid="op" data-nick="${esc(t.author)}">💬 回复</button>
                  <span class="p-floor">#1</span>
                </div>
              </div>
            </div>
            ${tops.map((r) => replyPostHTML(r, false)).join("")}
          </div>
          <div class="composer">
            <h3>回复话题</h3>
            <textarea id="rText" rows="3" placeholder="写下你想起的那件事……"></textarea>
            <div class="foot"><button class="btn btn-primary" id="rSubmit">发布回复</button></div>
          </div>`;
        bindPosts();
      }

      /* 话题操作：收藏 / 关注作者 / 私信 */
      async function loadTopicActions(topic) {
        const box = $("#topicActions");
        if (!box) return;
        const me = window.AUTH && window.AUTH.user;
        let fav = false, rel = null;
        try {
          if (me) {
            const favs = await (await fetch("/api/me/favorites")).json();
            fav = Array.isArray(favs) && favs.map(String).includes(String(topic.id));
          }
          if (me && topic.uid) {
            rel = await (await fetch("/api/users/" + topic.uid + "/relation")).json();
          }
        } catch {}
        box.innerHTML = `
          <button class="btn btn-ghost btn-sm" id="btnFav">${fav ? "⭐ 已收藏" : "☆ 收藏"}</button>
          ${me && topic.uid && topic.uid !== me.id ? `
            <button class="btn btn-ghost btn-sm" id="btnFollow">${rel && rel.following ? "✓ 已关注 " + esc(topic.author) : "＋ 关注 " + esc(topic.author)}</button>
            <a class="btn btn-ghost btn-sm" href="messages.html?to=${topic.uid}">✉ 私信</a>` : ""}
          ${!me ? '<span class="topic-actions-hint">登录后可收藏、关注作者、发私信</span>' : ""}`;
        box.querySelector("#btnFav")?.addEventListener("click", async () => {
          if (!me) { window.openAuth("login"); return; }
          const r = await fetch(`/api/topics/${encodeURIComponent(topic.id)}/favorite`, { method: "POST" });
          const d = await r.json();
          if (r.ok) { toast(d.favorited ? "已收藏，可在个人中心查看" : "已取消收藏"); loadTopicActions(topic); }
          else toast(d.error || "操作失败");
        });
        box.querySelector("#btnFollow")?.addEventListener("click", async () => {
          const r = await fetch(`/api/users/${topic.uid}/follow`, { method: "POST" });
          const d = await r.json();
          if (r.ok) { toast(d.following ? "已关注" : "已取消关注"); loadTopicActions(topic); }
          else toast(d.error || "操作失败");
        });
      }

      function bindPosts() {
        const me = window.AUTH && window.AUTH.user;
        $$(".act-like", root).forEach((btn) => {
          btn.addEventListener("click", () => {
            const k = btn.dataset.k;
            let on;
            storeUpdate((s) => {
              s.likes = s.likes || {};
              s.likes[t.id] = s.likes[t.id] || {};
              on = !s.likes[t.id][k];
              if (on) s.likes[t.id][k] = true;
              else delete s.likes[t.id][k];
            });
            render();
            const el = $(`.act-like[data-k="${k}"]`, root);
            el.classList.add("liked", "bump");
            toast(on ? "已赞" : "已取消赞");
          });
        });

        /* 发送回复：parentId 为空 = 顶层回复；否则挂到对应楼层下 */
        async function sendReply(text, parentId, after) {
          if (!me) { toast("请先登录后回复"); window.openAuth("login"); return false; }
          try {
            const resp = await fetch("/api/topics/" + encodeURIComponent(t.id) + "/replies", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text, parentId }),
            });
            const data = await resp.json();
            if (!resp.ok) { toast(data.error || "发布失败"); return false; }
            window.SERVER_REPLIES[t.id] = window.SERVER_REPLIES[t.id] || [];
            window.SERVER_REPLIES[t.id].push(data.reply);
            render();
            toast("回复已发布");
            if (after) after();
            return true;
          } catch {
            toast("后端未启动，无法发布");
            return false;
          }
        }

        /* 点楼层的「回复」→ 在该楼正下方展开内联回复框；楼主的「回复」→ 聚焦底部输入框 */
        $$(".act-reply", root).forEach((btn) => {
          btn.addEventListener("click", () => {
            if (btn.dataset.rid === "op") {
              $(".composer").scrollIntoView({ behavior: "smooth", block: "end" });
              $("#rText").focus();
              return;
            }
            const rid = btn.dataset.rid;
            $$(".rbox", root).forEach((b) => b.remove());
            const slot = $(`.rbox-slot[data-slot="${rid}"]`, root);
            if (!slot) return;
            const box = document.createElement("div");
            box.className = "rbox";
            box.innerHTML = `
              <textarea rows="2" placeholder="回复 ${esc(btn.dataset.nick)}……"></textarea>
              <div class="rbox-foot">
                <button type="button" class="btn btn-ghost btn-sm" data-x>取消</button>
                <button type="button" class="btn btn-primary btn-sm">回复</button>
              </div>`;
            slot.appendChild(box);
            box.querySelector("textarea").focus();
            box.querySelector("[data-x]").addEventListener("click", () => box.remove());
            box.querySelector(".btn-primary").addEventListener("click", async (e) => {
              const text = box.querySelector("textarea").value.trim();
              if (!text) return;
              e.target.disabled = true;
              const ok = await sendReply(text, rid, () => {
                const el = $(`.post[data-rid="${rid}"]`, root);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              });
              if (ok) box.remove();
              else e.target.disabled = false;
            });
          });
        });

        /* 底部输入框 = 顶层回复 */
        $("#rSubmit").addEventListener("click", async () => {
          const text = $("#rText").value.trim();
          if (!text) return;
          $("#rSubmit").disabled = true;
          const ok = await sendReply(text, null);
          if (ok) $("#rText").value = "";
          $("#rSubmit").disabled = false;
        });
      }

      render();
      loadTopicActions(t);
      renderRail({ author: t });
    }
  })();
})();
