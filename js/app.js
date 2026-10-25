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
  const avatar = (name, color, cls, img) =>
    img
      ? `<span class="avatar ${cls || ""}" style="--c:${color}"><img src="${esc(img)}" alt=""></span>`
      : `<span class="avatar ${cls || ""}" style="--c:${color}">${esc(name[0])}</span>`;
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
    const extra = (window.TOPIC_EXTRA || {})[t.id] || 0;
    return (t.views || 0) + (t.viewExtra || 0) + extra;
  }
  /* 点赞总数：主楼服务端计数 + 各评论计数之和 */
  function likeTotal(t) {
    const base = t.likeCount ?? t.likes ?? 0;
    return base + repliesOf(t).reduce((n, r) => n + (r.likeCount || 0), 0);
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
      html += `
      <div class="rail-card">
        <div class="rail-user-head">
          ${avatar(me.nickname, me.color, "", me.avatar)}
          <div><b>${esc(me.nickname)}</b><span>${me.grade ? me.grade + " 级" : "未设置年级"}</span></div>
        </div>
        <div class="rail-btns">
          <a class="btn btn-ghost" href="me.html">👤 个人中心</a>
          <a class="btn btn-ghost rail-msg-link" href="messages.html">✉ 消息<span class="cnt-badge" id="railMsgBadge" hidden></span></a>
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
      const me = window.AUTH && window.AUTH.user;
      html += `
      <div class="rail-card">
        <h4>作者</h4>
        <div class="rail-user-head">
          ${avatar(a.author, a.color, "", a.authorAvatar)}
          <div><b>${esc(a.author)}</b><span>${catById(a.category) ? catById(a.category).label : ""}</span></div>
        </div>
        <p style="color:var(--muted);font-size:12.5px;margin:0 0 4px">发布于 ${fmtTime(a.created)}</p>
        ${me && a.uid && a.uid !== me.id ? `
        <div class="rail-btns" style="margin-top:8px">
          <button class="btn btn-primary" id="railFollow" data-uid="${a.uid}">＋ 关注</button>
          <a class="btn btn-ghost" href="messages.html?to=${a.uid}">✉ 消息</a>
        </div>` : ""}
      </div>`;
    }

    if (stats) {
      html += `
      <div class="rail-card">
        <h4>站点统计</h4>
        <div class="stat-grid">
          <div><b>${new Set(allTopics().flatMap((t) => t.tags)).size}</b><span>话题</span></div>
          <div><b>${DATA.topics.length + stats.topics}</b><span>帖子</span></div>
          <div><b>${stats.users}</b><span>用户</span></div>
          <div><b>${stats.replies}</b><span>评论</span></div>
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
    /* 右栏消息按钮未读角标（与顶栏同一数据源） */
    if (me) {
      try {
        const d = await (await fetch("/api/me/unread-count")).json();
        const b = rail.querySelector("#railMsgBadge");
        if (b) {
          const t = d.total || 0;
          b.hidden = t === 0;
          b.textContent = t > 99 ? "99+" : String(t);
        }
      } catch {}
    }
    /* 作者卡关注按钮 */
    const rf = rail.querySelector("#railFollow");
    rf?.addEventListener("click", async () => {
      const r = await fetch(`/api/users/${rf.dataset.uid}/follow`, { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        rf.textContent = d.following ? "✓ 已关注" : "＋ 关注";
        rf.classList.toggle("btn-primary", !d.following);
        rf.classList.toggle("btn-ghost", d.following);
        toast(d.following ? "已关注" : "已取消关注");
      } else toast(d.error || "操作失败");
    });
  }
  window.__renderRail = renderRail;

  /* ---------- 公共区块 ---------- */
  const page = document.body.dataset.page;

  /* 侧栏（两页共用）：年级与标签按帖子量排前 5；前 3 名高亮（第1最强、第2次之、第3最淡），4/5 名不高亮 */
  const heatCls = (i) => (i === 0 ? "heat-1" : i === 1 ? "heat-2" : i === 2 ? "heat-3" : "");
  function renderSidebar(activeCat, activeTag) {
    const topics = allTopics();
    const catCount = (cid) => topics.filter((t) => t.category === cid).length;
    const tags = {};
    topics.forEach((t) => t.tags.forEach((g) => { tags[g] = (tags[g] || 0) + 1; }));

    /* 年级 Top5（按话题数）；当前筛选中的年级即使不在榜上也保留显示（不高亮） */
    let catList = (window.CATS || DATA.categories)
      .map((c) => ({ ...c, n: catCount(c.id) }))
      .sort((a, b) => b.n - a.n || a.id - b.id)
      .slice(0, 5);
    if (activeCat && !catList.some((c) => c.id === activeCat)) {
      const c = (window.CATS || DATA.categories).find((x) => x.id === activeCat);
      if (c) catList.push({ ...c, n: catCount(c.id) });
    }
    $("#sideCats").innerHTML = catList.map((c, i) => `
      <a class="side-item ${heatCls(i)} ${activeCat === c.id ? "active" : ""}" href="index.html?cat=${c.id}">
        <span class="cat-dot" style="background:${c.color}"></span>${c.label}
        <span class="cnt">${c.n}</span>
      </a>`).join("");

    /* 标签 Top5（按话题数）；当前筛选中的标签同样保留（不高亮） */
    let tagList = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (activeTag && !tagList.some(([g]) => g === activeTag)) {
      tagList.push([activeTag, tags[activeTag] || 0]);
    }
    $("#sideTags").innerHTML = tagList.map(([g, n], i) => `
      <a class="side-item ${heatCls(i)} ${activeTag === g ? "active" : ""}" href="index.html?tag=${encodeURIComponent(g)}">
        <span class="tag-ic">#</span>${esc(g)}
        <span class="cnt">${n}</span>
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
    /* 菜单按钮切换抽屉；点击页面空白处自动收起 */
    $("#btnMenu").addEventListener("click", (e) => {
      e.stopPropagation();
      document.body.classList.toggle("side-open");
    });
    document.addEventListener("click", (e) => {
      if (!document.body.classList.contains("side-open")) return;
      if (e.target.closest(".sidebar") || e.target.closest("#btnMenu")) return;
      document.body.classList.remove("side-open");
    });
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
        /* 热门：点赞量从高到低；点赞相同看评论量；再相同按最近活跃 */
        rest.sort((a, b) =>
          (likeTotal(b) - likeTotal(a)) ||
          (repliesOf(b).length - repliesOf(a).length) ||
          (lastActivity(b) - lastActivity(a)));
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
                <span title="点赞">❤ <b>${likeTotal(t)}</b></span>
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
      /* 浏览计数：服务端按访客去重（一人一帖只 +1），返回增量与基准相加展示 */
      const v = await (await fetch("/api/topics/" + encodeURIComponent(qs("id")) + "/view", { method: "POST" })).json();
      if (v && v.extra != null) {
        window.TOPIC_EXTRA = window.TOPIC_EXTRA || {};
        window.TOPIC_EXTRA[qs("id")] = v.extra;
      }
    } catch {}
    const t = findTopic(qs("id"));
    if (!t) {
      root.innerHTML = `<div class="empty-list">没有找到这个话题。<br><br><a class="btn btn-primary" href="index.html">回到话题列表</a></div>`;
      renderSidebar(null, null);
    } else {
      renderSidebar(t.category, null);
      document.title = `${t.title} · ${DATA.site.name}`;

      /* 点赞计数以服务端为准（t.likeCount / r.likeCount 由接口返回） */

      function render() {
        const rs = repliesOf(t);
        const cat = catById(t.category);
        /* 图片归一化：兼容旧对象格式 {src,caption} 与新字符串格式 "/uploads/x.jpg" */
        const tImgs = (t.images || []).map((m) =>
          typeof m === "string" ? { src: m, caption: "" } : m);
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
        const meNow = window.AUTH && window.AUTH.user;
        const canDelTopic = meNow && t.uid && (t.uid === meNow.id || meNow.role === "admin");

        const replyImgs = (r) => (r.images && r.images.length)
          ? `<div class="c-imgs">${r.images.map((u) => `<img class="c-img" src="${u}" alt="图片" loading="lazy">`).join("")}</div>` : "";

        /* 评论行（bbs-go 扁平风）：楼主徽章 + 年级头衔 + 删除（本人/帖主/管理员） */
        const gradeBadge = (g) => g ? `<span class="grade-badge">${g}</span>` : "";
        const replyHTML = (r, isChild) => {
          const isOp = (r.uid && r.uid === t.uid) || (!r.uid && r.user === t.author);
          const canDel = meNow && ((r.uid && r.uid === meNow.id) || (t.uid && t.uid === meNow.id) || meNow.role === "admin");
          const canDM = meNow && r.uid && r.uid !== meNow.id;
          const dmLink = (inner) => canDM
            ? `<a class="cmt-user" href="messages.html?to=${r.uid}" title="发私信">${inner}</a>`
            : `<span class="cmt-user">${inner}</span>`;
          const grade = r.grade ?? t.category;
          return `
          <div class="cmt${isChild ? " child" : ""}" data-rid="${r._id}">
            ${dmLink(avatar(r.user, r.color, "", r.avatar))}
            <div class="cmt-main">
              <div class="cmt-head">
                ${dmLink(`<b>${esc(r.user)}</b>`)}
                ${isOp ? '<span class="p-op-badge">楼主</span>' : ""}
                ${gradeBadge(grade)}
                <time>${fmtTime(r.time)}</time>
              </div>
              <p class="cmt-text">${esc(r.text)}</p>
              ${replyImgs(r)}
              <div class="cmt-actions">
                <button class="act-btn act-like" data-target="${r.id}">❤ <b>${r.likeCount || 0}</b></button>
                <button class="act-btn act-reply" data-rid="${r._id}" data-nick="${esc(r.user)}">💬 回复</button>
                ${canDM ? `<a class="act-btn" href="messages.html?to=${r.uid}">✉ 私信</a>` : ""}
                ${canDel ? `<button class="act-btn act-del" data-rid="${r._id}" title="删除（其下回复一并删除）">🗑 删除</button>` : ""}
              </div>
            </div>
          </div>
          <div class="rbox-slot" data-slot="${r._id}"></div>
          ${(kids[r._id] || []).map((c) => replyHTML(c, true)).join("")}`;
        };

        const mainGrade = t.authorGrade ?? t.category;
        root.innerHTML = `
          <header class="topic-head">
            <h1>${t.pinned ? "📌 " : ""}${esc(t.title)}</h1>
          </header>
          <div class="post-card">
            <div class="pc-head">
              ${avatar(t.author, t.color, "", t.authorAvatar)}
              <div class="pc-who">
                <b>${esc(t.author)}</b>${gradeBadge(mainGrade)}
                <time>发布于 ${fmtTime(t.created)}</time>
              </div>
              ${canDelTopic ? '<button class="btn btn-ghost btn-sm" id="delTopic">🗑 删除</button>' : ""}
            </div>
            <div class="pc-body">${t.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
            ${tImgs.length ? `<div class="pc-imgs">${tImgs.map((m) => `
              <figure><img src="${esc(m.src)}" alt="${esc(m.caption || "")}" data-cap="${esc(m.caption || "")}" loading="lazy"><figcaption>${esc(m.caption || "")}</figcaption></figure>`).join("")}</div>` : ""}
            <div class="pc-badges">${catChip(t.category)}${tagChips(t.tags)}</div>
            <div class="pc-actions">
              <span class="pa-item" title="浏览量">👁 浏览 <b>${viewCount(t)}</b></span>
              <button class="pa-item act-like" data-target="op">❤ 点赞 <b>${likeTotal(t)}</b></button>
              <button class="pa-item" id="paComment">💬 评论 <b>${rs.length}</b></button>
              <button class="pa-item" id="paFav">${t._fav ? "⭐ 已收藏" : "☆ 收藏"}</button>
            </div>
          </div>
          <div class="comments-card">
            <h3>评论（${rs.length}）</h3>
            <div class="cbox">
              <textarea id="rText" rows="2" placeholder="请输入您要发表的内容"></textarea>
              <div class="cbox-foot">
                <div class="c-stage" id="cStage" hidden></div>
                <button type="button" class="icon-btn" id="cImgBtn" title="添加图片">🖼</button>
                <input type="file" id="cImgInput" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>
                <button class="btn btn-primary btn-sm" id="rSubmit" style="margin-left:auto">发布</button>
              </div>
            </div>
            <div id="cList">${tops.map((r) => replyHTML(r, false)).join("") || '<p class="me-empty">暂无评论，来说点什么吧。</p>'}</div>
          </div>`;
        bindPosts();
      }

      /* 加载收藏状态 → 同步操作栏星标 */
      async function loadTopicActions(topic) {
        try {
          if (window.AUTH && window.AUTH.user) {
            const favs = await (await fetch("/api/me/favorites")).json();
            topic._fav = Array.isArray(favs) && favs.map(String).includes(String(topic.id));
            const fb = $("#paFav");
            if (fb) fb.innerHTML = topic._fav ? "⭐ 已收藏" : "☆ 收藏";
          }
        } catch {}
      }

      function bindPosts() {
        const me = window.AUTH && window.AUTH.user;

        /* 点赞（楼主与各评论通用，key 存本地演示） */
        /* 点赞：服务端 toggle（去重+通知），原位更新计数不整页重渲染 */
        $$(".act-like", root).forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!me) { toast("请先登录后点赞"); window.openAuth("login"); return; }
            btn.disabled = true;
            try {
              const resp = await fetch(`/api/topics/${encodeURIComponent(t.id)}/like`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target: btn.dataset.target }),
              });
              const d = await resp.json();
              if (!resp.ok) { toast(d.error || "操作失败"); return; }
              btn.querySelector("b").textContent = d.count;
              btn.classList.toggle("liked", d.liked);
              btn.classList.add("bump");
              toast(d.liked ? "已赞" : "已取消赞");
            } catch { toast("后端未启动，无法点赞"); }
            finally { btn.disabled = false; }
          });
        });

        /* 评论图片（最多 3 张）暂存 */
        let cImgs = [];
        const cStage = $("#cStage");
        function renderCStage() {
          cStage.hidden = !cImgs.length;
          cStage.innerHTML = cImgs.map((u, i) => `
            <div class="stage"><img src="${u}" alt=""><button type="button" data-rm="${i}">✕</button></div>`).join("");
          $$("[data-rm]", cStage).forEach((b) => b.addEventListener("click", () => {
            cImgs.splice(+b.dataset.rm, 1); renderCStage();
          }));
        }
        $("#cImgBtn").addEventListener("click", () => $("#cImgInput").click());
        $("#cImgInput").addEventListener("change", async (e) => {
          const files = [...e.target.files];
          e.target.value = "";
          for (const f of files) {
            if (cImgs.length >= 3) { toast("评论最多 3 张图片"); break; }
            if (f.size > 3 * 1024 * 1024) { toast(`「${f.name}」超过 3MB，已跳过`); continue; }
            await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = async () => {
                try {
                  const r = await fetch("/api/upload", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ data: reader.result }),
                  });
                  const d = await r.json();
                  if (r.ok && cImgs.length < 3) { cImgs.push(d.url); renderCStage(); }
                  else if (!r.ok) toast(d.error || "上传失败");
                } catch { toast("上传失败"); }
                resolve();
              };
              reader.readAsDataURL(f);
            });
          }
        });

        /* 发送评论：parentId 空 = 顶层；否则挂到对应评论下 */
        async function sendReply(text, parentId, imgs) {
          try {
            const resp = await fetch("/api/topics/" + encodeURIComponent(t.id) + "/replies", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text, parentId, images: imgs || [] }),
            });
            const data = await resp.json();
            if (!resp.ok) { toast(data.error || "发布失败"); return false; }
            window.SERVER_REPLIES[t.id] = window.SERVER_REPLIES[t.id] || [];
            window.SERVER_REPLIES[t.id].push(data.reply);
            render();
            toast("评论已发布");
            return true;
          } catch {
            toast("后端未启动，无法发布");
            return false;
          }
        }

        /* 操作栏「评论」→ 聚焦评论框 */
        $("#paComment").addEventListener("click", () => {
          $(".cbox").scrollIntoView({ behavior: "smooth", block: "center" });
          $("#rText").focus();
        });

        /* 操作栏「收藏」 */
        $("#paFav").addEventListener("click", async () => {
          if (!me) { window.openAuth("login"); return; }
          const r = await fetch(`/api/topics/${encodeURIComponent(t.id)}/favorite`, { method: "POST" });
          const d = await r.json();
          if (!r.ok) { toast(d.error || "操作失败"); return; }
          t._fav = d.favorited;
          $("#paFav").innerHTML = t._fav ? "⭐ 已收藏" : "☆ 收藏";
          toast(t._fav ? "已收藏，可在个人中心查看" : "已取消收藏");
        });

        /* 帖子右上角删除（作者/管理员）：二次确认后删除并返回首页 */
        $("#delTopic")?.addEventListener("click", async () => {
          if (!(await window.confirmDialog("确定删除这个帖子及其全部评论？\n删除后无法恢复。"))) return;
          const r = await fetch("/api/topics/" + encodeURIComponent(t.id), { method: "DELETE" });
          const d = await r.json();
          if (!r.ok) { toast(d.error || "删除失败"); return; }
          toast("帖子已删除");
          setTimeout(() => location.href = "index.html", 600);
        });

        /* 删除评论（本人/帖主/管理员）：二次确认，其下所有回复级联删除 */
        $$(".act-del", root).forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!(await window.confirmDialog("删除这条评论？\n其下所有回复将一并删除。"))) return;
            const r = await fetch(`/api/replies/${encodeURIComponent(t.id)}/${encodeURIComponent(btn.dataset.rid)}`, { method: "DELETE" });
            const d = await r.json();
            if (!r.ok) { toast(d.error || "删除失败"); return; }
            toast(d.removed > 1 ? `已删除（含 ${d.removed - 1} 条下级回复）` : "已删除");
            try {
              window.SERVER_REPLIES[t.id] = await (await fetch("/api/topics/" + encodeURIComponent(t.id) + "/replies")).json();
            } catch {}
            render();
          });
        });

        /* 顶层评论发布 */
        $("#rSubmit").addEventListener("click", async () => {
          const text = $("#rText").value.trim();
          if (!text && !cImgs.length) return;
          if (!me) { toast("请先登录后评论"); window.openAuth("login"); return; }
          $("#rSubmit").disabled = true;
          const ok = await sendReply(text, null, cImgs);
          if (ok) { $("#rText").value = ""; cImgs = []; renderCStage(); }
          $("#rSubmit").disabled = false;
        });

        /* 点某条评论的「回复」→ 该评论下方展开内联输入框（楼中楼） */
        $$(".act-reply", root).forEach((btn) => {
          btn.addEventListener("click", () => {
            if (!me) { toast("请先登录后评论"); window.openAuth("login"); return; }
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
              const ok = await sendReply(text, rid);
              if (ok) {
                box.remove();
                const el = $(`.cmt[data-rid="${rid}"]`, root);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              else e.target.disabled = false;
            });
          });
        });
      }

      render();
      loadTopicActions(t);
      renderRail({ author: t });
    }
  })();
})();
