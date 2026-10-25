/* ============================================================
 * 风华正茂 —— 私信
 * 规则：互相关注畅聊；未互关时，对方回复前只能发一条
 * ============================================================ */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  document.title = "私信 · 风华正茂";
  $("#btnTheme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      const s = JSON.parse(localStorage.getItem("sjforum.v1")) || {};
      s.theme = next;
      localStorage.setItem("sjforum.v1", JSON.stringify(s));
    } catch {}
  });

  let toastEl = null, toastTimer = null;
  const toast = (msg) => {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  };
  const relTime = (ts) => {
    const diff = Date.now() - ts;
    if (diff < 60e3) return "刚刚";
    if (diff < 3600e3) return `${Math.floor(diff / 60e3)}分钟前`;
    if (diff < 86400e3) return `${Math.floor(diff / 3600e3)}小时前`;
    return new Date(ts).toLocaleDateString();
  };

  const contactsBox = $("#contacts");
  const chatBox = $("#chat");
  let openUid = null;
  let pollTimer = null;
  /* ---------- 会话列表：普通会话 + 分组合集（点赞/回复/收藏通知、陌生人、新的关注） ---------- */
  async function loadContacts() {
    let contacts = [], notes = { list: [], unread: 0 }, followers = [];
    try {
      [contacts, notes, followers] = await Promise.all([
        fetch("/api/messages/contacts").then((r) => r.json()),
        fetch("/api/me/notifications").then((r) => r.json()),
        fetch("/api/me/followers").then((r) => r.json()).catch(() => []),
      ]);
    } catch { return; }
    if (!Array.isArray(contacts)) contacts = [];
    const notifList = Array.isArray(notes.list) ? notes.list : [];
    const unreadNotif = notes.unread || 0;

    const contactRow = (c) => `
      <div class="contact${c.id === openUid ? " on" : ""}" data-uid="${c.id}">
        <span class="avatar" style="--c:${c.color}">${esc(c.nickname[0])}</span>
        <div class="c-main">
          <div class="c-line"><b>${esc(c.nickname)}</b>${c.mutual ? '<span class="chip mutual">互关</span>' : ""}</div>
          <p class="c-last">${c.lastFromMe ? "我：" : ""}${esc(c.last)}</p>
        </div>
        <div class="c-side">
          ${c.unread ? `<span class="unread">${c.unread > 9 ? "9+" : c.unread}</span>` : ""}
          <time>${relTime(c.time)}</time>
        </div>
      </div>`;

    /* 分组：普通会话（互关或我已回复过）；其余进合集 */
    const normal = contacts.filter((c) => c.mutual || c.iSent);
    const strangers = contacts.filter((c) => !(c.mutual || c.iSent));
    const groupByUser = (list) => {
      const map = new Map();
      for (const n of list) {
        const cur = map.get(n.fromName);
        if (!cur || n.time > cur.time) map.set(n.fromName, { ...n, count: 1 });
        else cur.count++;
      }
      return [...map.values()].sort((a, b) => b.time - a.time);
    };
    const notifItem = (n) => `
      <a class="contact notif" href="topic.html?id=${encodeURIComponent(n.topicId)}">
        <span class="avatar" style="--c:${n.fromColor}">${esc(n.fromName[0])}</span>
        <div class="c-main">
          <div class="c-line"><b>${esc(n.fromName)}</b>${n.count > 1 ? `<span class="chip">${n.count} 条</span>` : ""}</div>
          <p class="c-last">${esc(n.text)}</p>
        </div>
        <div class="c-side"><time>${relTime(n.time)}</time></div>
      </a>`;
    const notifGroup = (label, list) => list.length
      ? `<div class="group-head">${label}</div>${list.map(notifItem).join("")}` : "";
    const likeNotes = groupByUser(notifList.filter((n) => n.type === "like"));
    const replyNotes = groupByUser(notifList.filter((n) => n.type === "reply" || n.type === "comment"));
    const favNotes = groupByUser(notifList.filter((n) => n.type === "fav"));

    let html = "";
    html += normal.length ? normal.map(contactRow).join("") : "";
    html += notifGroup("❤ 点赞消息", likeNotes);
    html += notifGroup("💬 回复消息", replyNotes);
    html += notifGroup("⭐ 收藏消息", favNotes);
    html += strangers.length ? `<div class="group-head">👤 陌生人</div>${strangers.map(contactRow).join("")}` : "";
    html += followers.length ? `<div class="group-head">🔔 新的关注</div>${followers.map((f) => `
      <div class="contact" data-uid="${f.id}">
        <span class="avatar" style="--c:${f.color}">${esc(f.nickname[0])}</span>
        <div class="c-main">
          <div class="c-line"><b>${esc(f.nickname)}</b><span class="chip">新关注</span></div>
          <p class="c-last">关注了你，点击开始交流</p>
        </div>
      </div>`).join("")}` : "";
    contactsBox.innerHTML = html || '<p class="c-empty">还没有会话与互动。去话题页找同学「✉ 消息」吧。</p>';

    /* 消息按钮角标：私信未读 + 通知未读 */
    const dmUnread = contacts.reduce((n, c) => n + (c.unread || 0), 0);
    window.setMsgBadge?.(dmUnread + unreadNotif);

    $$(".contact[data-uid]", contactsBox).forEach((el) =>
      el.addEventListener("click", () => open(+el.dataset.uid)));
  }

  /* ---------- 聊天窗 ---------- */
  async function open(uid) {
    openUid = uid;
    let data;
    try {
      data = await (await fetch("/api/messages/" + uid)).json();
    } catch { toast("无法连接后端服务"); return; }
    if (data.error) { chatBox.innerHTML = `<div class="chat-empty">${esc(data.error)}</div>`; return; }

    const me = window.AUTH.user;
    const u = data.user;
    chatBox.innerHTML = `
      <div class="chat-head">
        <span class="avatar" style="--c:${u.color}">${esc(u.nickname[0])}</span>
        <div class="chat-title">
          <b>${esc(u.nickname)}</b>
          <span>${u.grade ? u.grade + " 级" : ""}${data.mutual ? " · 互相关注" : ""}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="chatBack">← 会话</button>
      </div>
      <div class="chat-scroll" id="chatScroll"></div>
      <div class="chat-foot">
        <div class="composer-row">
          <textarea id="msgInput" rows="1" placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"></textarea>
          <button class="btn btn-primary" id="btnSend">发送</button>
        </div>
        ${data.canSend
          ? (data.mutual ? "" : '<p class="chat-hint">你们还未互相关注：对方回复前你只能发送一条消息</p>')
          : '<p class="chat-hint locked">🔒 等待对方回复后才能继续发送；互相关注后可以畅聊</p>'}
      </div>`;

    renderMsgs(data.messages, me.id);

    const input = $("#msgInput");
    const canSend = data.canSend;
    if (!canSend) { input.disabled = true; $("#btnSend").disabled = true; }

    $("#chatBack").addEventListener("click", () => { openUid = null; chatBox.innerHTML = '<div class="chat-empty">选择左侧会话</div>'; loadContacts(); });

    async function doSend() {
      const text = input.value.trim();
      if (!text) return;
      $("#btnSend").disabled = true;
      try {
        const r = await fetch("/api/messages/" + uid, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const d = await r.json();
        if (!r.ok) { toast(d.error || "发送失败"); return; }
        input.value = "";
        await refresh();
        if (!d.canSend) {
          input.disabled = true; $("#btnSend").disabled = true;
          const hint = chatBox.querySelector(".chat-hint");
          if (hint) { hint.classList.add("locked"); hint.textContent = "🔒 等待对方回复后才能继续发送；互相关注后可以畅聊"; }
          else chatBox.querySelector(".chat-foot").insertAdjacentHTML("beforeend", '<p class="chat-hint locked">🔒 等待对方回复后才能继续发送；互相关注后可以畅聊</p>');
        }
      } finally {
        if (canSendLocal()) $("#btnSend").disabled = false;
        function canSendLocal() { return !input.disabled; }
      }
    }

    $("#btnSend").addEventListener("click", doSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!input.disabled) doSend(); }
    });

    async function refresh() {
      try {
        const d2 = await (await fetch("/api/messages/" + uid)).json();
        if (!d2.error) renderMsgs(d2.messages, me.id);
      } catch {}
      loadContacts();
    }
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 5000);
    loadContacts();
  }

  function renderMsgs(msgs, myUid) {
    const box = $("#chatScroll");
    if (!box) return;
    box.innerHTML = msgs.length ? msgs.map((m) => `
      <div class="bubble-row ${m.from === myUid ? "mine" : ""}">
        <div class="bubble">
          <p>${esc(m.text)}</p>
          <time>${relTime(m.time)}</time>
        </div>
      </div>`).join("") : '<p class="chat-none">还没有消息，打个招呼吧 👋</p>';
    box.scrollTop = box.scrollHeight;
  }

  /* ---------- 启动 ---------- */
  const waitAuth = setInterval(async () => {
    if (window.AUTH && window.AUTH.__inited) {
      clearInterval(waitAuth);
      if (!window.AUTH.user) {
        $("#msgRoot").innerHTML = '<div class="me-card me-login-hint"><p>登录后可以和同学私信交流。</p><button class="btn btn-primary" id="goLogin">去登录</button></div>';
        $("#goLogin").addEventListener("click", () => window.openAuth("login"));
        return;
      }
      await loadContacts();
      const to = new URLSearchParams(location.search).get("to");
      if (to) open(+to);
    }
  }, 120);
})();
