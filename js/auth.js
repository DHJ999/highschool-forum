/* ============================================================
 * 风华正茂 —— 登录态 + 个人菜单（登录/注册跳转独立页面 login.html）
 * ============================================================ */
(function () {
  "use strict";

  /* 恢复主题偏好（所有加载 auth.js 的页面统一） */
  try {
    const s = JSON.parse(localStorage.getItem("sjforum.v1"));
    if (s && s.theme) document.documentElement.dataset.theme = s.theme;
  } catch {}

  window.AUTH = { user: null };

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const notify = (msg) => { if (window.toast) window.toast(msg); };

  /* 登录/注册/重置 → 独立页面 */
  window.openAuth = (mode) => {
    location.href = "login.html" + (mode ? "?mode=" + encodeURIComponent(mode) : "");
  };

  /* ---------- 站内二次确认弹窗 ---------- */
  window.confirmDialog = (msg) => new Promise((resolve) => {
    let m = document.querySelector("#cdMask");
    if (m) m.remove();
    m = document.createElement("div");
    m.className = "modal-mask open";
    m.id = "cdMask";
    m.innerHTML = `
      <div class="modal" style="max-width:380px">
        <h3 style="margin:0 0 10px">确认操作</h3>
        <p style="color:var(--muted);font-size:14px;margin:0 0 18px;white-space:pre-line">${esc(msg)}</p>
        <div class="foot">
          <button type="button" class="btn btn-ghost" id="cdNo">取消</button>
          <button type="button" class="btn btn-primary" id="cdYes" style="background:var(--like)">确定删除</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    const done = (v) => { m.remove(); resolve(v); };
    m.addEventListener("click", (e) => { if (e.target === m) done(false); });
    m.querySelector("#cdNo").addEventListener("click", () => done(false));
    m.querySelector("#cdYes").addEventListener("click", () => done(true));
  });

  /* ---------- 顶栏登录区 ---------- */
  function renderArea() {
    const area = document.getElementById("authArea");
    if (!area) return;
    const u = window.AUTH.user;
    if (u) {
      area.innerHTML = `
        <a class="btn btn-ghost msg-link" href="messages.html" title="消息">✉ <span class="msg-txt">消息</span><span class="cnt-badge" id="msgBadge" hidden></span></a>
        <div class="user-menu" id="userMenu">
          <button class="auth-user" id="btnAvatar" title="个人菜单">
            <span class="avatar" style="--c:${u.color}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(u.nickname[0])}</span>
            <b>${esc(u.nickname)}</b><span class="caret">▾</span>
          </button>
          <div class="user-dropdown">
            <div class="ud-head">${esc(u.email)}</div>
            <button class="ud-item" data-m="profile">🎨 头像与昵称</button>
            <a class="ud-item" href="me.html">👤 个人中心</a>
            ${u.role === "admin" ? "" : '<button class="ud-item" data-m="email">📮 更换邮箱</button>'}
            <button class="ud-item" data-m="grade">🎓 入学年级（${u.grade ? u.grade + " 级" : "未设置"}）</button>
            <button class="ud-item" data-m="theme">◐ 深浅色（当前：${document.documentElement.dataset.theme === "light" ? "浅色" : "深色"}）</button>
            ${u.role === "admin" ? '<a class="ud-item" href="admin.html">⚙ 管理后台</a>' : ""}
            <div class="ud-sep"></div>
            <button class="ud-item ud-danger" data-m="logout">退出登录</button>
          </div>
        </div>`;
      const menu = area.querySelector("#userMenu");
      area.querySelector("#btnAvatar").addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("open");
      });
      document.addEventListener("click", () => menu.classList.remove("open"));
      area.querySelector('[data-m="logout"]').addEventListener("click", async () => {
        try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
        location.reload();
      });
      area.querySelector('[data-m="profile"]').addEventListener("click", () => { menu.classList.remove("open"); openProfileEdit(); });
      if (u.role !== "admin") area.querySelector('[data-m="email"]').addEventListener("click", () => { menu.classList.remove("open"); openEmailChange(); });
      area.querySelector('[data-m="grade"]').addEventListener("click", () => { menu.classList.remove("open"); openGradeModal(); });
      /* 深浅色：切换并写入账号（换设备登录后跟随账号） */
      area.querySelector('[data-m="theme"]').addEventListener("click", async () => {
        menu.classList.remove("open");
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        window.AUTH.applyTheme(next);
        const item = area.querySelector('[data-m="theme"]');
        if (item) item.textContent = `◐ 深浅色（当前：${next === "light" ? "浅色" : "深色"}）`;
        try {
          const r = await fetch("/api/me/profile", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: next }),
          });
          if (r.ok) window.AUTH.user = (await r.json()).user;
        } catch {}
        notify(next === "light" ? "已切换浅色模式" : "已切换深色模式");
      });

      /* 登录后主题在用户菜单里，隐藏顶栏的 ◐ 按钮（游客仍可用） */
      const bt = document.getElementById("btnTheme");
      if (bt) bt.hidden = true;

      /* 消息按钮角标：私信未读 + 通知未读，30 秒轮询 */
      async function refreshMsgBadge() {
        try {
          const d = await (await fetch("/api/me/unread-count")).json();
          const b = area.querySelector("#msgBadge");
          if (!b) return;
          const n = Math.min(d.total || 0, 99);
          const label = (d.total || 0) > 99 ? "99+" : String(n);
          b.hidden = (d.total || 0) === 0;
          b.textContent = label;
        } catch {}
      }
      refreshMsgBadge();
      setInterval(refreshMsgBadge, 30000);
    } else {
      area.innerHTML = `<a class="btn btn-ghost" href="login.html">登录</a>`;
    }
  }

  /* ---------- 头像与昵称 ---------- */
  const PALETTE = ["#f09048", "#599ac7", "#83b058", "#c86da0", "#4fb3b3", "#9d7fd6", "#d9a832", "#ee6b6b"];

  function openProfileEdit() {
    const u = window.AUTH.user;
    if (!u) return;
    let m = document.querySelector("#profEditMask");
    if (m) m.remove();
    m = document.createElement("div");
    m.className = "modal-mask open";
    m.id = "profEditMask";
    m.innerHTML = `
      <form class="modal" id="profEditForm">
        <h3>头像与昵称</h3>
        <div class="field"><label>自定义头像（可选，上传后替代颜色+首字）</label>
          <div class="av-row">
            <span class="avatar avatar-lg" id="avPreview" style="--c:${u.color}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc(u.nickname[0])}</span>
            <div class="av-btns">
              <button type="button" class="btn btn-ghost btn-sm" id="avUpload">📷 上传头像</button>
              <button type="button" class="btn btn-ghost btn-sm" id="avReset" ${u.avatar ? "" : "hidden"}>↺ 恢复默认</button>
            </div>
            <input type="file" id="avInput" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
            <p class="av-hint" id="avHint" hidden></p>
          </div>
        </div>
        <div class="field"><label>头像颜色（未上传图片时生效）</label>
          <div class="swatches" id="swatches">
            ${PALETTE.map((c) => `<button type="button" class="swatch${c === u.color ? " on" : ""}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}
          </div>
        </div>
        <div class="field"><label>昵称</label>
          <input id="peNick" maxlength="12" value="${esc(u.nickname)}" required></div>
        <p class="auth-err" id="peErr"></p>
        <div class="foot">
          <button type="button" class="btn btn-ghost" id="peCancel">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    let picked = u.color;
    m.querySelectorAll(".swatch").forEach((s) => s.addEventListener("click", () => {
      picked = s.dataset.c;
      m.querySelectorAll(".swatch").forEach((x) => x.classList.toggle("on", x === s));
    }));

    /* 裁剪器（Cropper.js，MIT）：按需加载，选图后弹窗让用户拖拽/缩放/旋转调整 */
    const loadCropper = () => {
      if (window.Cropper) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/css/vendor/cropper.min.css?v=1.6.2";
        document.head.appendChild(link);
        const s = document.createElement("script");
        s.src = "/js/vendor/cropper.min.js?v=1.6.2";
        s.onload = resolve;
        s.onerror = () => reject(new Error("cropper load failed"));
        document.head.appendChild(s);
      });
    };
    const openAvatarCropper = (file) => loadCropper().then(() => new Promise((resolve) => {
      const cm = document.createElement("div");
      cm.className = "modal-mask open";
      cm.id = "cropMask";
      cm.innerHTML = `
        <div class="modal" id="cropModal">
          <h3>裁剪头像</h3>
          <div class="crop-box"><img id="cropImg" alt="待裁剪图片"></div>
          <p class="av-hint" style="text-align:center">拖动选框选择范围，滚轮或按钮缩放图片</p>
          <div class="foot" style="align-items:center">
            <button type="button" class="btn btn-ghost btn-sm" id="cropRotate" title="旋转 90°">↻</button>
            <button type="button" class="btn btn-ghost btn-sm" id="cropZoomOut" title="缩小">－</button>
            <button type="button" class="btn btn-ghost btn-sm" id="cropZoomIn" title="放大">＋</button>
            <span style="flex:1"></span>
            <button type="button" class="btn btn-ghost" id="cropCancel">取消</button>
            <button type="button" class="btn btn-primary" id="cropOk">确认裁切</button>
          </div>
        </div>`;
      document.body.appendChild(cm);
      const url = URL.createObjectURL(file);
      const cimg = cm.querySelector("#cropImg");
      cimg.src = url;
      const cropper = new Cropper(cimg, {
        aspectRatio: 1, viewMode: 1, dragMode: "move", autoCropArea: 0.9, background: false,
      });
      const done = (val) => {
        try { cropper.destroy(); } catch {}
        URL.revokeObjectURL(url);
        cm.remove();
        resolve(val);
      };
      cm.querySelector("#cropRotate").addEventListener("click", () => cropper.rotate(90));
      cm.querySelector("#cropZoomIn").addEventListener("click", () => cropper.zoom(0.1));
      cm.querySelector("#cropZoomOut").addEventListener("click", () => cropper.zoom(-0.1));
      cm.querySelector("#cropCancel").addEventListener("click", () => done(null));
      cm.addEventListener("click", (e) => { if (e.target === cm) done(null); });
      cm.querySelector("#cropOk").addEventListener("click", () => {
        const canvas = cropper.getCroppedCanvas({ width: 400, height: 400, imageSmoothingQuality: "high", fillColor: "#fff" });
        done(canvas ? canvas.toDataURL("image/jpeg", 0.9) : null);
      });
    }));

    let pending = null;   /* 待保存的新头像 dataURL */
    let removing = false; /* 待保存的“恢复默认”操作 */
    const pv = m.querySelector("#avPreview");
    const hint = m.querySelector("#avHint");

    m.querySelector("#avUpload").addEventListener("click", () => m.querySelector("#avInput").click());
    m.querySelector("#avInput").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      m.querySelector("#peErr").textContent = "";
      let dataUrl = null;
      try { dataUrl = await openAvatarCropper(f); }
      catch { m.querySelector("#peErr").textContent = "裁剪组件加载失败，请检查网络后重试"; return; }
      if (!dataUrl) return; /* 用户在裁剪窗点了取消 */
      pending = dataUrl;
      removing = false;
      pv.innerHTML = `<img src="${pending}" alt="">`;
      pv.classList.add("pending");
      hint.hidden = false;
      hint.textContent = "已选择新头像，点击下方「保存」后生效";
    });
    m.querySelector("#avReset").addEventListener("click", () => {
      pending = null;
      removing = true;
      pv.innerHTML = esc(u.nickname[0]);
      pv.classList.remove("pending");
      hint.hidden = false;
      hint.textContent = "保存后将恢复默认头像";
      m.querySelector("#avReset").hidden = true;
    });
    m.querySelector("#peCancel").addEventListener("click", () => m.remove());
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    m.querySelector("#profEditForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        if (pending) {
          const r = await fetch("/api/me/avatar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: pending }),
          });
          const d = await r.json();
          if (!r.ok) { m.querySelector("#peErr").textContent = d.error || "头像上传失败"; return; }
        }
        const body = { nickname: m.querySelector("#peNick").value.trim(), color: picked };
        if (removing) body.avatar = null;
        const r = await fetch("/api/me/profile", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) { m.querySelector("#peErr").textContent = d.error || "保存失败"; return; }
        window.AUTH.user = d.user;
        notify("资料已更新");
        m.remove();
        renderArea();
      } catch { m.querySelector("#peErr").textContent = "保存失败"; }
    });
  }

  /* ---------- 更换邮箱（验证码发到新邮箱） ---------- */
  function openEmailChange() {
    const u = window.AUTH.user;
    if (!u) return;
    let m = document.querySelector("#emailMask");
    if (m) m.remove();
    m = document.createElement("div");
    m.className = "modal-mask open";
    m.id = "emailMask";
    m.innerHTML = `
      <form class="modal" id="emailForm">
        <h3>更换邮箱</h3>
        <p style="color:var(--muted);font-size:13px;margin:0 0 14px">当前邮箱：${esc(u.email)}</p>
        <div class="field"><label>新邮箱</label>
          <input id="emNew" type="email" required placeholder="new@example.com"></div>
        <div class="field"><label>验证码（发送到新邮箱）</label>
          <div class="code-row">
            <input id="emCode" maxlength="6" inputmode="numeric" placeholder="6 位验证码">
            <button type="button" class="btn btn-ghost" id="emSend">发送验证码</button>
          </div>
        </div>
        <p class="auth-err" id="emErr"></p>
        <div class="foot">
          <button type="button" class="btn btn-ghost" id="emCancel">取消</button>
          <button type="submit" class="btn btn-primary">确认更换</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    m.querySelector("#emNew").focus();
    m.querySelector("#emCancel").addEventListener("click", () => m.remove());
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });

    const errEl = () => m.querySelector("#emErr");
    let cd = 0;
    m.querySelector("#emSend").addEventListener("click", async () => {
      if (cd > 0) return;
      const em = m.querySelector("#emNew").value.trim();
      if (!em) { errEl().textContent = "请先填写新邮箱"; return; }
      const btn = m.querySelector("#emSend");
      btn.disabled = true;
      try {
        const r = await fetch("/api/auth/send-code", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: em }),
        });
        const d = await r.json();
        if (!r.ok) { errEl().textContent = d.error || "发送失败"; btn.disabled = false; return; }
        notify("验证码已发送到新邮箱");
        cd = 60;
        const tick = setInterval(() => {
          btn.textContent = `${cd--}s 后可重发`;
          if (cd < 0) { clearInterval(tick); btn.textContent = "发送验证码"; btn.disabled = false; }
        }, 1000);
      } catch { errEl().textContent = "无法连接后端服务"; btn.disabled = false; }
    });
    m.querySelector("#emailForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await fetch("/api/me/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: m.querySelector("#emNew").value.trim(), code: m.querySelector("#emCode").value.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { errEl().textContent = d.error || "更换失败"; return; }
      notify("邮箱已更换：" + d.user.email);
      m.remove();
      setTimeout(() => location.reload(), 600);
    });
  }

  /* ---------- 入学年级（仅一次） ---------- */
  function openGradeModal() {
    const u = window.AUTH.user;
    if (!u) return;
    let m = document.querySelector("#profMask");
    if (m) m.remove();
    let opts = '<option value="">请选择入学年级</option>';
    for (let y = 2026; y >= 1990; y--) {
      opts += `<option value="${y}" ${u.grade === y ? "selected" : ""}>${y} 级</option>`;
    }
    m = document.createElement("div");
    m.className = "modal-mask open";
    m.id = "profMask";
    m.innerHTML = `
      <form class="modal" id="profForm">
        <h3>个人设置</h3>
        <p style="color:var(--muted);font-size:13px;margin:0 0 14px">账号：${esc(u.email)} · 昵称：${esc(u.nickname)}</p>
        <div class="field"><label>入学年级</label>
          <select id="pGrade" ${u.gradeChanged ? "disabled" : ""}>${opts}</select></div>
        <p class="auth-err" id="profErr"></p>
        <p style="color:var(--muted);font-size:12.5px">${u.gradeChanged
          ? "入学年级已使用过自助修改机会，再次修改请联系管理员：your-email@example.com"
          : "提示：入学年级仅可自助修改一次，请慎重选择；再次修改请联系管理员：your-email@example.com"}</p>
        <div class="foot">
          <button type="button" class="btn btn-ghost" id="pCancel">关闭</button>
          ${u.gradeChanged ? "" : '<button type="submit" class="btn btn-primary">保存</button>'}
        </div>
      </form>`;
    document.body.appendChild(m);
    m.querySelector("#pCancel").addEventListener("click", () => m.remove());
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    m.querySelector("#profForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const g = m.querySelector("#pGrade").value;
      if (!g) { m.querySelector("#profErr").textContent = "请选择入学年级"; return; }
      const r = await fetch("/api/me/grade", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: +g }),
      });
      const d = await r.json();
      if (!r.ok) { m.querySelector("#profErr").textContent = d.error || "保存失败"; return; }
      window.AUTH.user = d.user;
      notify("入学年级已保存");
      m.remove();
      renderArea();
    });
  }

  /* ---------- 主题：应用/切换（登录后跟随账号，游客存本地） ---------- */
  window.AUTH.applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      const s = JSON.parse(localStorage.getItem("sjforum.v1")) || {};
      s.theme = theme;
      localStorage.setItem("sjforum.v1", JSON.stringify(s));
    } catch {}
  };

  /* ---------- 初始化：获取当前登录态 ---------- */
  (async () => {
    try {
      const data = await (await fetch("/api/me")).json();
      window.AUTH.user = data.user;
      /* 账号里存过主题 → 覆盖本地偏好 */
      if (data.user && data.user.theme) window.AUTH.applyTheme(data.user.theme);
    } catch { /* 后端未启动：保持未登录态 */ }
    window.AUTH.__inited = true;
    renderArea();
  })();
})();
