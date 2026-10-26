/* ============================================================
 * 风华正茂 —— 更换邮箱（独立页面，验证码发到新邮箱）
 * ============================================================ */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const errEl = $("#emailErr");
  const okEl = $("#emailOk");
  const setErr = (msg) => { errEl.textContent = msg; if (msg) okEl.hidden = true; };

  let user = null;

  (async () => {
    try {
      user = (await (await fetch("/api/me")).json()).user;
    } catch {
      $("#emailLoading").textContent = "无法连接后端服务，请稍后刷新重试";
      return;
    }
    if (!user) { location.replace("login.html"); return; }
    $("#emailLoading").hidden = true;
    $("#emailCard").hidden = false;
    $("#emailCurrent").textContent = user.email;
    if (user.role === "admin") {
      $("#emailAdminNote").hidden = false;
      return;
    }
    $("#emailFormWrap").hidden = false;
    $("#emNew").focus();
  })();

  /* 发送验证码（60 秒冷却） */
  let cooldown = 0;
  $("#emSend").addEventListener("click", async () => {
    if (cooldown > 0 || !user) return;
    const email = $("#emNew").value.trim();
    if (!email) { setErr("请先填写新邮箱"); $("#emNew").focus(); return; }
    if (email === user.email) { setErr("新邮箱不能与当前邮箱相同"); return; }
    setErr("");
    okEl.hidden = true;
    const btn = $("#emSend");
    btn.disabled = true;
    try {
      const r = await fetch("/api/auth/send-code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "发送失败"); btn.disabled = false; return; }
      okEl.hidden = false;
      cooldown = 60;
      btn.textContent = `${cooldown}s 后可重发`;
      const tick = setInterval(() => {
        cooldown--;
        if (cooldown <= 0) {
          clearInterval(tick);
          btn.textContent = "发送验证码";
          btn.disabled = false;
        } else {
          btn.textContent = `${cooldown}s 后可重发`;
        }
      }, 1000);
    } catch {
      setErr("无法连接后端服务，请稍后重试");
      btn.disabled = false;
    }
  });

  $("#emailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user) return;
    const newEmail = $("#emNew").value.trim();
    const code = $("#emCode").value.trim();
    if (!newEmail) { setErr("请填写新邮箱"); return; }
    if (!code) { setErr("请填写验证码"); return; }
    setErr("");
    const submit = $("#emSubmit");
    submit.disabled = true;
    try {
      const r = await fetch("/api/me/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, code }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "更换失败"); return; }
      window.AUTH.user = d.user;
      const menuHead = document.querySelector(".ud-head");
      if (menuHead) menuHead.textContent = d.user.email;
      $("#emailDoneAddr").textContent = d.user.email;
      $("#emailFormWrap").hidden = true;
      $("#emailBackLinks").hidden = true;
      $("#emailDone").hidden = false;
      $("#emailCard").querySelector(".auth-head h2").textContent = "✅ 邮箱已更换";
    } catch {
      setErr("无法连接后端服务，请稍后重试");
    } finally {
      submit.disabled = false;
    }
  });
})();
