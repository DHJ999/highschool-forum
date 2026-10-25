/* ============================================================
 * 风华正茂 —— 登录 / 注册 / 忘记密码（独立页面，三种模式）
 * ============================================================ */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

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

  /* 已登录用户直接回首页 */
  (async () => {
    try {
      const me = await (await fetch("/api/me")).json();
      if (me.user) location.href = "index.html";
    } catch {}
  })();

  /* 入学年级选项 1990–2026 */
  (function fillGrades() {
    const sel = $("#aGrade");
    for (let y = 2026; y >= 1990; y--) {
      const op = document.createElement("option");
      op.value = y;
      op.textContent = `${y} 级`;
      sel.appendChild(op);
    }
  })();

  /* 密码小眼睛 */
  $$(".pw-eye").forEach((eye) => eye.addEventListener("click", () => {
    const input = $("#" + eye.dataset.for);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    eye.textContent = show ? "🙈" : "👁";
    input.focus();
  }));

  const err = (msg) => { $("#authErr").textContent = msg; };

  /* ---------- 模式切换：login | register | reset ---------- */
  let mode = "login";
  function setMode(m) {
    mode = m;
    $$(".reg-only").forEach((f) => {
      f.hidden = m !== "register";
      $$("input,select", f).forEach((el) => { el.disabled = m !== "register"; });
    });
    const codeOn = m !== "login";
    $(".code-field").hidden = !codeOn;
    $$("input,button", $(".code-field")).forEach((el) => { el.disabled = !codeOn; });
    $("#authTitle").textContent = m === "login" ? "🔒 账号登录" : m === "register" ? "📝 注册新账号" : "🔑 重置密码";
    $("#aPassLabel").textContent = m === "reset" ? "新密码" : "密码";
    $("#aPass").placeholder = m === "reset" ? "请输入新密码（至少 6 位）" : "请输入密码";
    $("#authSubmit").textContent = m === "login" ? "登录" : m === "register" ? "注册" : "重置密码";
    $("#lnkForgotRow").hidden = m !== "login";
    $("#lnkBackRow").hidden = m !== "reset";
    $("#altRow").innerHTML = m === "login"
      ? '没有账号？<a id="lnkRegister">点击这里去注册&gt;&gt;</a>'
      : '已有账号？<a id="lnkBack2">去登录&gt;&gt;</a>';
    $("#lnkRegister")?.addEventListener("click", () => setMode("register"));
    $("#lnkBack2")?.addEventListener("click", () => setMode("login"));
    $("#authErr").textContent = "";
  }

  const qp = new URLSearchParams(location.search).get("mode");
  setMode(qp === "register" || qp === "reset" ? qp : "login");
  $("#lnkForgot").addEventListener("click", () => setMode("reset"));
  $("#lnkBack").addEventListener("click", () => setMode("login"));

  /* ---------- 发送验证码（60 秒冷却） ---------- */
  let cooldown = 0;
  $("#btnSendCode").addEventListener("click", async () => {
    if (cooldown > 0) return;
    const email = $("#aEmail").value.trim();
    if (!email) { err("请先填写邮箱"); return; }
    const btn = $("#btnSendCode");
    btn.disabled = true;
    try {
      const resp = await fetch("/api/auth/send-code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      if (!resp.ok) { err(data.error || "发送失败"); btn.disabled = false; return; }
      err("验证码已发送，请查收邮箱（注意垃圾邮件箱）");
      cooldown = 60;
      const tick = setInterval(() => {
        btn.textContent = `${cooldown--}s 后可重发`;
        if (cooldown < 0) { clearInterval(tick); btn.textContent = "发送验证码"; btn.disabled = false; }
      }, 1000);
    } catch {
      err("无法连接后端服务（请确认 node server 已启动）");
      btn.disabled = false;
    }
  });

  /* ---------- 提交 ---------- */
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#aEmail").value.trim();
    const password = $("#aPass").value;
    const submit = $("#authSubmit");
    submit.disabled = true;
    try {
      let resp, data;
      if (mode === "register") {
        const grade = $("#aGrade").value;
        if (!grade) { err("请选择入学年级"); return; }
        if (password !== $("#aPass2").value) { err("两次输入的密码不一致"); return; }
        resp = await fetch("/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email, code: $("#aCode").value.trim(),
            nickname: $("#aNick").value.trim(), grade: +grade, password,
          }),
        });
      } else if (mode === "reset") {
        resp = await fetch("/api/auth/reset-password", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: $("#aCode").value.trim(), password }),
        });
      } else {
        resp = await fetch("/api/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      }
      data = await resp.json();
      if (!resp.ok) { err(data.error || "操作失败"); return; }
      if (mode === "reset") {
        err("");
        setMode("login");
        $("#aPass").value = "";
        alertStyle("密码已重置，请使用新密码登录");
        return;
      }
      location.href = "index.html";
    } catch {
      err("无法连接后端服务（请确认 node server 已启动）");
    } finally {
      submit.disabled = false;
    }
  });

  /* 成功提示样式（绿色，替代 alert） */
  function alertStyle(msg) {
    const el = $("#authErr");
    el.style.color = "#58a666";
    el.textContent = msg;
    setTimeout(() => { el.style.color = ""; el.textContent = ""; }, 4000);
  }
})();
