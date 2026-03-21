// src/services/email.service.js
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = "StyleApp <onboarding@resend.dev>"; // cambiar por tu dominio si tienes

// ── Email aprobación de cuenta profesional ────────────────────────────────
exports.sendApprovalEmail = async ({ name, email, role }) => {
  const roleLabels = {
    barber:        "Barbero(a)",
    estilista:     "Estilista",
    quiropodologo: "Quiropodologo(a)",
  };
  const roleLabel = roleLabels[role] || role;

  try {
    const result = await resend.emails.send({
      from:    FROM,
      to:      email,
      subject: "✅ Tu cuenta StyleApp fue aprobada",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:32px 20px;">

            <!-- Logo -->
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#D4AF37;font-size:36px;margin:0;font-weight:900;letter-spacing:2px;">
                Style
              </h1>
              <p style="color:#888;font-size:13px;margin:4px 0 0;">Tu plataforma de servicios de belleza</p>
            </div>

            <!-- Card principal -->
            <div style="background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #D4AF3755;">

              <!-- Icono éxito -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:#0a2a0a;border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;font-size:36px;">
                  ✅
                </div>
              </div>

              <h2 style="color:#ffffff;font-size:22px;margin:0 0 8px;text-align:center;">
                ¡Cuenta aprobada!
              </h2>
              <p style="color:#aaa;text-align:center;margin:0 0 28px;font-size:14px;">
                Hola <strong style="color:#D4AF37;">${name}</strong>, tu registro como <strong style="color:#D4AF37;">${roleLabel}</strong> fue revisado y aprobado por nuestro equipo.
              </p>

              <!-- Detalles -->
              <div style="background:#0d0d0d;border-radius:10px;padding:20px;margin-bottom:24px;">
                <p style="color:#ccc;margin:0 0 10px;font-size:14px;">
                  ✔ Tu identidad fue verificada
                </p>
                <p style="color:#ccc;margin:0 0 10px;font-size:14px;">
                  ✔ Tus antecedentes fueron consultados
                </p>
                <p style="color:#ccc;margin:0;font-size:14px;">
                  ✔ Tu cuenta está activa y lista para recibir servicios
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:24px;">
                <p style="color:#ffffff;font-size:16px;font-weight:700;margin:0 0 8px;">
                  Ya puedes iniciar sesión en la app
                </p>
                <p style="color:#888;font-size:13px;margin:0;">
                  Abre StyleApp → Inicia sesión → ¡Empieza a recibir servicios!
                </p>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;">

              <p style="color:#555;font-size:12px;text-align:center;margin:0;">
                Si tienes dudas escríbenos a
                <a href="mailto:soporte@styleapp.co" style="color:#D4AF37;">soporte@styleapp.co</a>
              </p>
            </div>

            <p style="color:#333;font-size:11px;text-align:center;margin-top:24px;">
              StyleApp · Medellín, Colombia · Este correo fue enviado porque registraste una cuenta profesional.
            </p>
          </div>
        </body>
        </html>
      `,
    });
    console.log(`Email aprobación enviado a ${email}:`, result?.data?.id);
    return result;
  } catch (err) {
    console.error("Error enviando email aprobación:", err.message);
  }
};

// ── Email rechazo de cuenta profesional ──────────────────────────────────
exports.sendRejectionEmail = async ({ name, email, role, reason }) => {
  const roleLabels = {
    barber:        "Barbero(a)",
    estilista:     "Estilista",
    quiropodologo: "Quiropodologo(a)",
  };
  const roleLabel = roleLabels[role] || role;

  try {
    const result = await resend.emails.send({
      from:    FROM,
      to:      email,
      subject: "❌ Actualización sobre tu registro en StyleApp",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:32px 20px;">

            <!-- Logo -->
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#D4AF37;font-size:36px;margin:0;font-weight:900;letter-spacing:2px;">
                Style
              </h1>
              <p style="color:#888;font-size:13px;margin:4px 0 0;">Tu plataforma de servicios de belleza</p>
            </div>

            <!-- Card principal -->
            <div style="background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #dd000055;">

              <!-- Icono -->
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:#2a0a0a;border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;font-size:36px;">
                  ❌
                </div>
              </div>

              <h2 style="color:#ffffff;font-size:22px;margin:0 0 8px;text-align:center;">
                Registro no aprobado
              </h2>
              <p style="color:#aaa;text-align:center;margin:0 0 28px;font-size:14px;">
                Hola <strong style="color:#fff;">${name}</strong>, revisamos tu solicitud de registro como <strong style="color:#fff;">${roleLabel}</strong> y lamentablemente no pudimos aprobarla en este momento.
              </p>

              <!-- Motivo -->
              <div style="background:#1a0505;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #dd0000;">
                <p style="color:#dd0000;font-weight:700;margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1px;">
                  Motivo del rechazo:
                </p>
                <p style="color:#ccc;margin:0;font-size:15px;line-height:1.6;">
                  ${reason}
                </p>
              </div>

              <!-- Qué hacer -->
              <div style="background:#0d0d0d;border-radius:10px;padding:20px;margin-bottom:24px;">
                <p style="color:#D4AF37;font-weight:700;margin:0 0 12px;font-size:14px;">
                  ¿Qué puedes hacer?
                </p>
                <p style="color:#ccc;margin:0 0 8px;font-size:14px;">
                  → Corrige los documentos indicados en el motivo
                </p>
                <p style="color:#ccc;margin:0 0 8px;font-size:14px;">
                  → Contáctanos para más información
                </p>
                <p style="color:#ccc;margin:0;font-size:14px;">
                  → Vuelve a registrarte con los documentos correctos
                </p>
              </div>

              <!-- Contacto -->
              <div style="text-align:center;">
                <p style="color:#888;font-size:13px;margin:0;">
                  ¿Tienes preguntas? Escríbenos a
                  <a href="mailto:soporte@styleapp.co" style="color:#D4AF37;">soporte@styleapp.co</a>
                </p>
              </div>
            </div>

            <p style="color:#333;font-size:11px;text-align:center;margin-top:24px;">
              StyleApp · Medellín, Colombia
            </p>
          </div>
        </body>
        </html>
      `,
    });
    console.log(`Email rechazo enviado a ${email}:`, result?.data?.id);
    return result;
  } catch (err) {
    console.error("Error enviando email rechazo:", err.message);
  }
};

// ── Email de bienvenida para nuevos profesionales (al registrarse) ────────
exports.sendWelcomeProfessionalEmail = async ({ name, email, role }) => {
  const roleLabels = {
    barber:        "Barbero(a)",
    estilista:     "Estilista",
    quiropodologo: "Quiropodologo(a)",
  };
  const roleLabel = roleLabels[role] || role;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      email,
      subject: "📋 Registro recibido — StyleApp",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,sans-serif;">
          <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="color:#D4AF37;font-size:36px;margin:0;font-weight:900;">Style</h1>
            </div>
            <div style="background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #D4AF3755;">
              <h2 style="color:#fff;text-align:center;margin:0 0 16px;">¡Registro recibido!</h2>
              <p style="color:#aaa;text-align:center;font-size:14px;margin:0 0 24px;">
                Hola <strong style="color:#D4AF37;">${name}</strong>, recibimos tu solicitud de registro como <strong style="color:#D4AF37;">${roleLabel}</strong>.
              </p>
              <div style="background:#0d0d0d;border-radius:10px;padding:20px;margin-bottom:24px;">
                <p style="color:#ccc;font-size:14px;margin:0 0 10px;">
                  ⏳ Nuestro equipo revisará tu información en las próximas <strong style="color:#D4AF37;">24 horas</strong>.
                </p>
                <p style="color:#ccc;font-size:14px;margin:0 0 10px;">
                  📧 Recibirás un email con el resultado de la revisión.
                </p>
                <p style="color:#ccc;font-size:14px;margin:0;">
                  📱 También puedes ingresar a la app y explorar mientras esperás.
                </p>
              </div>
              <p style="color:#555;font-size:12px;text-align:center;margin:0;">
                Soporte: <a href="mailto:soporte@styleapp.co" style="color:#D4AF37;">soporte@styleapp.co</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });
    console.log(`Email bienvenida enviado a ${email}`);
  } catch (err) {
    console.error("Error enviando email bienvenida:", err.message);
  }
};
