// src/services/email.service.js
// Nodemailer con Gmail SMTP puerto 587 (Railway compatible)

const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   "smtp.gmail.com",
      port:   587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout:   10000,
    });
  }
  return transporter;
}

const FROM = () => `StyleApp <${process.env.GMAIL_USER || "noreply@styleapp.co"}>`;

exports.sendWelcomeProfessionalEmail = async ({ name, email, role }) => {
  const roleLabels = { barber: "Barbero(a)", estilista: "Estilista", quiropodologo: "Quiropodólogo(a)" };
  try {
    await getTransporter().sendMail({
      from: FROM(), to: email,
      subject: "📋 Registro recibido — StyleApp",
      html: `<div style="background:#0d0d0d;padding:32px;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <h1 style="color:#D4AF37;text-align:center;">Style</h1>
        <div style="background:#1a1a1a;border-radius:16px;padding:28px;">
          <h2 style="color:#fff;text-align:center;">¡Registro recibido!</h2>
          <p style="color:#aaa;">Hola <strong style="color:#D4AF37;">${name}</strong>, recibimos tu registro como <strong style="color:#D4AF37;">${roleLabels[role] || role}</strong>.</p>
          <div style="background:#0d0d0d;border-radius:10px;padding:18px;margin:20px 0;">
            <p style="color:#ccc;margin:0 0 10px;">⏳ Revisaremos en las próximas <strong style="color:#D4AF37;">24 horas</strong>.</p>
            <p style="color:#ccc;margin:0 0 10px;">📧 Recibirás un email con el resultado.</p>
            <p style="color:#ccc;margin:0;">📱 Puedes explorar la app mientras esperas.</p>
          </div>
        </div>
      </div>`,
    });
    console.log(`✉ Email bienvenida → ${email}`);
  } catch (err) {
    console.error("Error email bienvenida:", err.message);
  }
};

exports.sendApprovalEmail = async ({ name, email, role }) => {
  const roleLabels = { barber: "Barbero(a)", estilista: "Estilista", quiropodologo: "Quiropodólogo(a)" };
  try {
    await getTransporter().sendMail({
      from: FROM(), to: email,
      subject: "✅ Tu cuenta StyleApp fue aprobada",
      html: `<div style="background:#0d0d0d;padding:32px;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <h1 style="color:#D4AF37;text-align:center;">Style</h1>
        <div style="background:#1a1a1a;border-radius:16px;padding:28px;border:1px solid #4caf5055;">
          <div style="text-align:center;font-size:56px;">✅</div>
          <h2 style="color:#fff;text-align:center;">¡Cuenta aprobada!</h2>
          <p style="color:#aaa;">Hola <strong style="color:#D4AF37;">${name}</strong>, tu registro como <strong style="color:#D4AF37;">${roleLabels[role] || role}</strong> fue aprobado.</p>
          <div style="background:#0a2a0a;border-radius:10px;padding:18px;margin:20px 0;border-left:4px solid #4caf50;">
            <p style="color:#ccc;margin:0 0 8px;">✔ Tu identidad fue verificada</p>
            <p style="color:#ccc;margin:0 0 8px;">✔ Tus antecedentes fueron consultados</p>
            <p style="color:#ccc;margin:0;">✔ Tu cuenta está activa y lista</p>
          </div>
          <div style="background:#111;border-radius:10px;padding:16px;text-align:center;margin:20px 0;">
            <p style="color:#fff;font-weight:bold;margin:0 0 6px;">Ya puedes iniciar sesión en la app</p>
          </div>
        </div>
      </div>`,
    });
    console.log(`✉ Email aprobación → ${email}`);
  } catch (err) {
    console.error("Error email aprobación:", err.message);
  }
};

exports.sendRejectionEmail = async ({ name, email, role, reason }) => {
  const roleLabels = { barber: "Barbero(a)", estilista: "Estilista", quiropodologo: "Quiropodólogo(a)" };
  try {
    await getTransporter().sendMail({
      from: FROM(), to: email,
      subject: "❌ Actualización sobre tu registro en StyleApp",
      html: `<div style="background:#0d0d0d;padding:32px;font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
        <h1 style="color:#D4AF37;text-align:center;">Style</h1>
        <div style="background:#1a1a1a;border-radius:16px;padding:28px;border:1px solid #dd000055;">
          <div style="text-align:center;font-size:56px;">❌</div>
          <h2 style="color:#fff;text-align:center;">Registro no aprobado</h2>
          <p style="color:#aaa;">Hola <strong style="color:#fff;">${name}</strong>, no pudimos aprobar tu registro como <strong>${roleLabels[role] || role}</strong>.</p>
          <div style="background:#1a0505;border-radius:10px;padding:18px;margin:20px 0;border-left:4px solid #dd0000;">
            <p style="color:#dd0000;font-weight:bold;margin:0 0 8px;">Motivo del rechazo:</p>
            <p style="color:#ccc;margin:0;">${reason}</p>
          </div>
          <div style="background:#0d0d0d;border-radius:10px;padding:18px;margin:20px 0;">
            <p style="color:#D4AF37;font-weight:bold;margin:0 0 10px;">¿Qué puedes hacer?</p>
            <p style="color:#ccc;margin:0 0 8px;">→ Corrige los documentos indicados</p>
            <p style="color:#ccc;margin:0;">→ Vuelve a registrarte con los documentos correctos</p>
          </div>
        </div>
      </div>`,
    });
    console.log(`✉ Email rechazo → ${email}`);
  } catch (err) {
    console.error("Error email rechazo:", err.message);
  }
};
