/* ============================================================
 * 风华正茂 —— 发布帖子页（#话题预选 + 图片上传）
 * ============================================================ */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

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

  /* ---------- 话题库（内置 + 服务端） ---------- */
  let TAGS = [];
  async function loadTags() {
    const cnt = {};
    DATA.topics.forEach((t) => t.tags.forEach((g) => { cnt[g] = (cnt[g] || 0) + 1; }));
    try {
      const server = await (await fetch("/api/topics")).json();
      server.forEach((t) => t.tags.forEach((g) => { cnt[g] = (cnt[g] || 0) + 1; }));
    } catch {}
    TAGS = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  }
  const parseTopics = (val) =>
    [...new Set([...String(val).matchAll(/#([^\s#,，]+)/g)].map((m) => m[1]))].slice(0, 5);

  /* ---------- #话题 输入 + 预选下拉 ---------- */
  const input = $("#nTopics");
  const pop = $("#topicPop");
  const hide = () => pop.classList.remove("open");
  const currentQuery = () => {
    const v = input.value;
    const idx = v.lastIndexOf("#");
    if (idx === -1) return null;
    const rest = v.slice(idx + 1);
    return /[\s#]/.test(rest) ? null : rest;
  };
  function renderPop() {
    const q = currentQuery();
    if (q === null) { hide(); return; }
    const starts = TAGS.filter(([t]) => t.startsWith(q));
    const contains = TAGS.filter(([t]) => !t.startsWith(q) && t.includes(q));
    const items = starts.concat(contains).slice(0, 6);
    let html = items.map(([t, n]) =>
      `<div class="topic-item" data-t="${esc(t)}"><span># ${esc(t)}</span><small>${n} 篇</small></div>`).join("");
    if (q && !TAGS.some(([t]) => t === q)) {
      html += `<div class="topic-item create" data-t="${esc(q)}"><span>创建新话题「# ${esc(q)}」</span><small>新</small></div>`;
    }
    if (!html) html = '<div class="topic-item none">输入话题名称，或直接创建新话题</div>';
    pop.innerHTML = html;
    pop.classList.add("open");
    $$(".topic-item[data-t]", pop).forEach((el) =>
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = input.value.lastIndexOf("#");
        input.value = input.value.slice(0, idx + 1) + el.dataset.t + " ";
        hide();
        input.focus();
      }));
  }
  input.addEventListener("input", renderPop);
  input.addEventListener("focus", renderPop);
  input.addEventListener("blur", () => setTimeout(hide, 150));

  /* ---------- 图片上传（多图暂存，大图自动压缩） ---------- */
  let images = [];
  const stageRow = $("#stageRow");
  function renderStage() {
    stageRow.innerHTML = images.map((u, i) => `
      <div class="stage">
        <img src="${u}" alt="">
        <button type="button" data-rm="${i}" title="移除">✕</button>
      </div>`).join("");
    $$("[data-rm]", stageRow).forEach((b) => b.addEventListener("click", () => {
      images.splice(+b.dataset.rm, 1);
      renderStage();
    }));
  }
  /* 压缩：gif 不动；超过 400KB 或边长超 1920 的图缩放并转 JPEG（白底），失败则用原图 */
  function compressImage(file) {
    return new Promise((resolve) => {
      if (file.type === "image/gif" || file.size <= 400 * 1024) return resolve(file);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const k = MAX / Math.max(width, height);
          width = Math.max(1, Math.round(width * k));
          height = Math.max(1, Math.round(height * k));
        }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        c.toBlob((b) => resolve(b || file), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  $("#btnImgs").addEventListener("click", () => $("#imgInput").click());
  $("#imgInput").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    for (const f of files) {
      if (images.length >= 9) { toast("最多 9 张图片"); break; }
      const f2 = await compressImage(f);
      if (f2.size > 3 * 1024 * 1024) { toast(`「${f.name}」压缩后仍超过 3MB，已跳过`); continue; }
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const r = await fetch("/api/upload", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: reader.result }),
            });
            const d = await r.json();
            if (r.ok && images.length < 9) { images.push(d.url); renderStage(); }
            else if (!r.ok) toast(d.error || "上传失败");
          } catch { toast("上传失败"); }
          resolve();
        };
        reader.readAsDataURL(f2);
      });
    }
  });

  /* ---------- 提交 ---------- */
  $("#pfForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const me = window.AUTH && window.AUTH.user;
    if (!me) { window.openAuth("login"); return; }
    const title = $("#nTitle").value.trim();
    if (!title) { $("#pfErr").textContent = "标题不能为空"; return; }
    const body = $("#nBody").value.trim();
    /* 话题规则：填了就必须以 # 开头，裸文字（如「你好，新同学。」）判为非法 */
    const raw = input.value.trim();
    if (raw) {
      const tags = parseTopics(raw);
      const residue = raw.replace(/#[^\s#,，]+/g, "").replace(/[\s,，#]/g, "");
      if (!tags.length || residue) {
        $("#pfErr").textContent = "话题必须以 # 开头（如 #军训），多个话题用空格分隔；不需要话题可留空";
        input.focus();
        return;
      }
    }
    const tags = parseTopics(raw);
    const btn = $("#pfSubmit");
    btn.disabled = true;
    try {
      const resp = await fetch("/api/topics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, tags, body, images }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        $("#pfErr").textContent = data.error || "发布失败";
        if (String(data.error || "").includes("入学年级")) {
          $("#pfErr").innerHTML = `${esc(data.error)}　<a href="me.html" style="color:var(--accent)">去设置 →</a>`;
        }
        return;
      }
      toast("帖子已发布");
      location.href = "topic.html?id=" + data.topic.id;
    } catch {
      $("#pfErr").textContent = "无法连接后端服务";
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- 登录守卫 ---------- */
  const waitAuth = setInterval(async () => {
    if (window.AUTH && window.AUTH.__inited) {
      clearInterval(waitAuth);
      if (!window.AUTH.user) {
        $("#pfRoot").innerHTML = `
          <div class="modal pf-card" style="text-align:center">
            <h3>发布帖子</h3>
            <p style="color:var(--muted);font-size:14px">登录后才能发布帖子</p>
            <button class="btn btn-primary" id="goLogin">去登录</button>
          </div>`;
        $("#goLogin").addEventListener("click", () => window.openAuth("login"));
        return;
      }
      if (!window.AUTH.user.grade) {
        $("#pfTip").innerHTML = '你还没有设置年级（头衔），<a href="me.html" style="color:var(--accent)">去设置 →</a>　发帖会自动归入你的年级';
      } else {
        $("#pfTip").textContent = `帖子会自动归入你的年级（${window.AUTH.user.grade} 级）`;
      }
      loadTags();
    }
  }, 120);
})();
