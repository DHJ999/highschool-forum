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
  let stagedImg = null; /* {url, el} 待发送图片 */

  /* ---------- 灯箱 ---------- */
  const lb = $("#msgLb");
  lb.addEventListener("click", (e) => { if (e.target.tagName !== "IMG") lb.hidden = true; });
  document.addEventListener("click", (e) => {
    const img = e.target.closest(".msg-img");
    if (img) { lb.querySelector("img").src = img.src; lb.hidden = false; }
  });

  /* ---------- 会话列表 ---------- */
  async function loadContacts() {
    try {
      const list = await (await fetch("/api/messages/contacts")).json();
      if (!Array.isArray(list)) return;
      contactsBox.innerHTML = list.length ? list.map((c) => `
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
        </div>`).join("") : '<p class="c-empty">还没有会话。去话题页找同学「✉ 私信」吧。</p>';
      $$(".contact", contactsBox).forEach((el) =>
        el.addEventListener("click", () => open(+el.dataset.uid)));
    } catch {}
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
          <span>${u.grade ? u.grade + " 级入学" : ""}${data.mutual ? " · 互相关注" : ""}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="chatBack">← 会话</button>
      </div>
      <div class="chat-scroll" id="chatScroll"></div>
      <div class="chat-foot">
        <div class="stage" id="stage" hidden></div>
        <div class="composer-row">
          <button class="btn btn-ghost btn-sm" id="btnImg" title="发送图片">📷</button>
          <input type="file" id="imgInput" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
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
    if (!canSend) { input.disabled = true; $("#btnSend").disabled = true; $("#btnImg").disabled = true; }

    $("#chatBack").addEventListener("click", () => { openUid = null; chatBox.innerHTML = '<div class="chat-empty">选择左侧会话</div>'; loadContacts(); });

    /* 图片选择 → 上传 → 暂存 */
    $("#btnImg").addEventListener("click", () => $("#imgInput").click());
    $("#imgInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast("图片不能超过 3MB"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          toast("图片上传中…");
          const r = await fetch("/api/upload", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: reader.result }),
          });
          const d = await r.json();
          if (!r.ok) { toast(d.error || "上传失败"); return; }
          stagedImg = d.url;
          const stage = $("#stage");
          stage.hidden = false;
          stage.innerHTML = `<img src="${d.url}" alt=""><button type="button" id="unstage" title="移除">✕</button>`;
          $("#unstage").addEventListener("click", () => { stagedImg = null; stage.hidden = true; stage.innerHTML = ""; });
        } catch { toast("上传失败"); }
      };
      reader.readAsDataURL(f);
    });

    async function doSend() {
      const text = input.value.trim();
      if (!text && !stagedImg) return;
      $("#btnSend").disabled = true;
      try {
        const r = await fetch("/api/messages/" + uid, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, images: stagedImg ? [stagedImg] : [] }),
        });
        const d = await r.json();
        if (!r.ok) { toast(d.error || "发送失败"); return; }
        input.value = "";
        stagedImg = null;
        const stage = $("#stage");
        if (stage) { stage.hidden = true; stage.innerHTML = ""; }
        await refresh();
        if (!d.canSend) {
          input.disabled = true; $("#btnSend").disabled = true; $("#btnImg").disabled = true;
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
          ${m.images && m.images.length ? m.images.map((u) => `<img class="msg-img" src="${u}" alt="图片" loading="lazy">`).join("") : ""}
          ${m.text ? `<p>${esc(m.text)}</p>` : ""}
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
