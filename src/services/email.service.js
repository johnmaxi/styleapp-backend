// src/services/email.service.js
const nodemailer = require("nodemailer");

// ── Configurar transporter Gmail — puerto 587 (Railway compatible) ──────────
const transporter = nodemailer.createTransport({
  host:   "smtp.gmail.com",
  port:   587,
  secure: false,          // TLS, NO SSL
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,
  greetingTimeout:   10000,
  socketTimeout:     15000,
});

const FROM = `StyleApp <${process.env.GMAIL_USER}>`;

// ── Email bienvenida al registrarse (profesional) ─────────────────────────
exports.sendWelcomeProfessionalEmail = async ({ name, email, role }) => {
  const roleLabels = {
    barber: "Barbero(a)", estilista: "Estilista", quiropodologo: "Quiropodologo(a)",
  };
  const roleLabel = roleLabels[role] || role;

  try {
    await transporter.sendMail({
      from: FROM,
      to:   email,
      subject: "📋 Registro recibido — StyleApp",
      html: `
        <div style="background:#0d0d0d;padding:32px;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <h1 style="color:#D4AF37;text-align:center;font-size:32px;margin:0 0 24px;">Style</h1>
          <div style="background:#1a1a1a;border-radius:16px;padding:28px;border:1px solid #D4AF3755;">
            <h2 style="color:#fff;text-align:center;margin:0 0 16px;">¡Registro recibido!</h2>
            <p style="color:#aaa;font-size:14px;line-height:1.6;">
              Hola <strong style="color:#D4AF37;">${name}</strong>,<br><br>
              Recibimos tu solicitud de registro como <strong style="color:#D4AF37;">${roleLabel}</strong>.
            </p>
            <div style="background:#0d0d0d;border-radius:10px;padding:18px;margin:20px 0;">
              <p style="color:#ccc;font-size:14px;margin:0 0 10px;">⏳ Revisaremos tu información en las próximas <strong style="color:#D4AF37;">24 horas</strong>.</p>
              <p style="color:#ccc;font-size:14px;margin:0 0 10px;">📧 Recibirás un email con el resultado.</p>
              <p style="color:#ccc;font-size:14px;margin:0;">📱 Puedes explorar la app mientras esperas.</p>
            </div>
            <p style="color:#555;font-size:12px;text-align:center;margin:0;">
              Soporte: soporte@styleapp.co
            </p>
          </div>
        </div>
      `,
    });
    console.log(`✉ Email bienvenida enviado a ${email}`);
  } catch (err) {
    console.error("Error email bienvenida:", err.message);
  }
};

// ── Email aprobación ──────────────────────────────────────────────────────
exports.sendApprovalEmail = async ({ name, email, role }) => {
  const roleLabels = {
    barber: "Barbero(a)", estilista: "Estilista", quiropodologo: "Quiropodologo(a)",
  };
  const roleLabel = roleLabels[role] || role;

  try {
    await transporter.sendMail({
      from: FROM,
      to:   email,
      subject: "✅ Tu cuenta StyleApp fue aprobada",
      html: `
        <div style="background:#0d0d0d;padding:32px;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <h1 style="color:#D4AF37;text-align:center;font-size:32px;margin:0 0 24px;">Style</h1>
          <div style="background:#1a1a1a;border-radius:16px;padding:28px;border:1px solid #4caf5055;">
            <div style="text-align:center;font-size:56px;margin-bottom:16px;">✅</div>
            <h2 style="color:#fff;text-align:center;margin:0 0 16px;">¡Cuenta aprobada!</h2>
            <p style="color:#aaa;font-size:14px;line-height:1.6;">
              Hola <strong style="color:#D4AF37;">${name}</strong>,<br><br>
              Tu registro como <strong style="color:#D4AF37;">${roleLabel}</strong> fue aprobado por nuestro equipo.
            </p>
            <div style="background:#0a2a0a;border-radius:10px;padding:18px;margin:20px 0;border-left:4px solid #4caf50;">
              <p style="color:#ccc;font-size:14px;margin:0 0 8px;">✔ Tu identidad fue verificada</p>
              <p style="color:#ccc;font-size:14px;margin:0 0 8px;">✔ Tus antecedentes fueron consultados</p>
              <p style="color:#ccc;font-size:14px;margin:0;">✔ Tu cuenta está activa y lista</p>
            </div>
            <div style="background:#111;border-radius:10px;padding:16px;text-align:center;margin:20px 0;">
              <p style="color:#fff;font-weight:bold;font-size:15px;margin:0 0 6px;">Ya puedes iniciar sesión en la app</p>
              <p style="color:#888;font-size:13px;margin:0;">Abre StyleApp → Inicia sesión → ¡Empieza a recibir servicios!</p>
            </div>
            <p style="color:#555;font-size:12px;text-align:center;margin:0;">
              ¿Dudas? Escríbenos a soporte@styleapp.co
            </p>
          </div>
        </div>
      `,
    });
    console.log(`✉ Email aprobación enviado a ${email}`);
  } catch (err) {
    console.error("Error email aprobación:", err.message);
  }
};

// ── Email rechazo ─────────────────────────────────────────────────────────
exports.sendRejectionEmail = async ({ name, email, role, reason }) => {
  const roleLabels = {
    barber: "Barbero(a)", estilista: "Estilista", quiropodologo: "Quiropodologo(a)",
  };
  const roleLabel = roleLabels[role] || role;

  try {
    await transporter.sendMail({
      from: FROM,
      to:   email,
      subject: "❌ Actualización sobre tu registro en StyleApp",
      html: `
        <div style="background:#0d0d0d;padding:32px;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <h1 style="color:#D4AF37;text-align:center;font-size:32px;margin:0 0 24px;">Style</h1>
          <div style="background:#1a1a1a;border-radius:16px;padding:28px;border:1px solid #dd000055;">
            <div style="text-align:center;font-size:56px;margin-bottom:16px;">❌</div>
            <h2 style="color:#fff;text-align:center;margin:0 0 16px;">Registro no aprobado</h2>
            <p style="color:#aaa;font-size:14px;line-height:1.6;">
              Hola <strong style="color:#fff;">${name}</strong>,<br><br>
              Revisamos tu solicitud de registro como <strong style="color:#fff;">${roleLabel}</strong> y no pudimos aprobarla en este momento.
            </p>
            <div style="background:#1a0505;border-radius:10px;padding:18px;margin:20px 0;border-left:4px solid #dd0000;">
              <p style="color:#dd0000;font-weight:bold;font-size:12px;margin:0 0 8px;text-transform:uppercase;">Motivo del rechazo:</p>
              <p style="color:#ccc;font-size:15px;margin:0;line-height:1.6;">${reason}</p>
            </div>
            <div style="background:#0d0d0d;border-radius:10px;padding:18px;margin:20px 0;">
              <p style="color:#D4AF37;font-weight:bold;font-size:14px;margin:0 0 10px;">¿Qué puedes hacer?</p>
              <p style="color:#ccc;font-size:14px;margin:0 0 8px;">→ Corrige los documentos indicados</p>
              <p style="color:#ccc;font-size:14px;margin:0 0 8px;">→ Contáctanos para más información</p>
              <p style="color:#ccc;font-size:14px;margin:0;">→ Vuelve a registrarte con los documentos correctos</p>
            </div>
            <p style="color:#555;font-size:12px;text-align:center;margin:0;">
              Soporte: soporte@styleapp.co
            </p>
          </div>
        </div>
      `,
    });
    console.log(`✉ Email rechazo enviado a ${email}`);
  } catch (err) {
    console.error("Error email rechazo:", err.message);
  }
};
