const nodemailer = require("nodemailer");

function createMailer(cfg) {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: true, // 465 端口 SSL
    auth: { user: cfg.user, pass: cfg.pass },
  });

  return {
    async verify() {
      return transport.verify();
    },
    async sendCode(to, code) {
      await transport.sendMail({
        from: `"${cfg.fromName}" <${cfg.user}>`,
        to,
        subject: `【${cfg.fromName}】邮箱验证码 ${code}`,
        text: `你的验证码是 ${code}，5 分钟内有效。若非本人操作，请忽略本邮件。`,
        html: `<div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:440px;margin:0 auto;padding:30px;border:1px solid #e5e5e5;border-radius:14px">
          <h2 style="margin:0 0 6px;color:#1d2025">${cfg.fromName}</h2>
          <p style="color:#6b7480;font-size:13px;margin:0 0 20px">高中同学故事纪念站 · 注册邮箱验证</p>
          <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#0083a3">${code}</div>
          <p style="color:#9aa0a8;font-size:12px;margin-top:20px">验证码 5 分钟内有效。若非本人操作，请忽略本邮件。</p>
        </div>`,
      });
    },
  };
}

module.exports = { createMailer };
