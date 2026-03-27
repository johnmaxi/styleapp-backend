// src/jobs/serviceExpiry.js
const pool = require("../db/db");

const EXPIRY_MINUTES  = 10;
const WARNING_MINUTES = 7;

async function sendExpoPush(tokens, title, body, data = {}) {
  if (!tokens?.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map(token => ({
        to: token, sound: "default", title, body, data,
        priority: "high", channelId: "styleapp-notifications",
      }))),
    });
  } catch {}
}

async function expireOldServices() {
  const client = await pool.connect();
  try {
    // ── 1. Expirar servicios abiertos que superaron los 10 min ─────────
    const expired = await client.query(
      `UPDATE service_request
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'open'
         AND requested_at < NOW() - INTERVAL '${EXPIRY_MINUTES} minutes'
         AND (expires_at IS NULL OR expires_at < NOW())
       RETURNING id, client_id, service_type, address, price,
                 professional_type, payment_method`
    );

    if (expired.rowCount > 0) {
      console.log(`Servicios expirados: ${expired.rowCount} →`, expired.rows.map(r => r.id));

      for (const service of expired.rows) {
        try {
          const clientRes = await client.query(
            `SELECT push_token FROM users WHERE id = $1`,
            [service.client_id]
          );
          const token = clientRes.rows[0]?.push_token;
          if (token) {
            await sendExpoPush(
              [token],
              "⏰ Servicio sin profesional disponible",
              `Tu solicitud de "${service.service_type}" expiró sin recibir profesionales. Puedes volver a publicarlo.`,
              {
                type:              "service_expired",
                service_id:        service.id,
                service_type:      service.service_type,
                address:           service.address,
                price:             String(service.price),
                professional_type: service.professional_type,
                payment_method:    service.payment_method,
              }
            );
          }
        } catch {}
      }
    }

    // ── 2. Advertencia a los 7 min (antes de expirar) ──────────────────
    const toWarn = await client.query(
      `SELECT sr.id, sr.client_id, sr.service_type, u.push_token
       FROM service_request sr
       JOIN users u ON u.id = sr.client_id
       WHERE sr.status = 'open'
         AND sr.expiry_notified = false
         AND sr.requested_at < NOW() - INTERVAL '${WARNING_MINUTES} minutes'
         AND sr.requested_at > NOW() - INTERVAL '${EXPIRY_MINUTES} minutes'`
    );

    for (const service of toWarn.rows) {
      try {
        if (service.push_token) {
          await sendExpoPush(
            [service.push_token],
            "⚠️ Tu servicio expirará pronto",
            `"${service.service_type}" lleva 7 min sin ser aceptado. Expirará en 3 min. Considera aumentar el precio.`,
            { type: "service_warning", service_id: service.id }
          );
        }
        await client.query(
          `UPDATE service_request SET expiry_notified = true WHERE id = $1`,
          [service.id]
        );
      } catch {}
    }

    if (toWarn.rowCount > 0) {
      console.log(`Advertencias enviadas: ${toWarn.rowCount}`);
    }

  } catch (err) {
    console.error("serviceExpiry error:", err.message);
  } finally {
    client.release();
  }
}


// ── Recordatorios 1 hora antes para servicios agendados ──────────────────
async function sendScheduledReminders() {
  const client = await pool.connect();
  try {
    // Servicios agendados que empiezan en 50-70 min (ventana para no duplicar)
    const toRemind = await client.query(
      `SELECT sr.id, sr.client_id, sr.assigned_barber_id,
              sr.service_type, sr.address, sr.price, sr.scheduled_at,
              uc.push_token AS client_token, uc.name AS client_name,
              up.push_token AS prof_token, up.name AS prof_name
       FROM service_request sr
       JOIN users uc ON uc.id = sr.client_id
       LEFT JOIN users up ON up.id = sr.assigned_barber_id
       WHERE sr.scheduled_at IS NOT NULL
         AND sr.status IN ('open','accepted')
         AND sr.reminder_sent = false
         AND sr.scheduled_at BETWEEN NOW() + INTERVAL '50 minutes'
                                  AND NOW() + INTERVAL '70 minutes'`
    );

    for (const svc of toRemind.rows) {
      const time = new Date(svc.scheduled_at).toLocaleTimeString("es-CO",
        { hour: "2-digit", minute: "2-digit" });

      // Notificar al cliente
      if (svc.client_token) {
        await sendExpoPush(
          [svc.client_token],
          "⏰ Recordatorio de tu servicio",
          `Tu ${svc.service_type} está programado para las ${time}. ¡Prepárate!`,
          { type: "service_reminder", service_id: svc.id, role: "client" }
        );
      }

      // Notificar al profesional
      if (svc.prof_token) {
        await sendExpoPush(
          [svc.prof_token],
          "⏰ Recordatorio de servicio agendado",
          `Tienes un ${svc.service_type} a las ${time} en ${svc.address || "la ubicación del cliente"}.`,
          { type: "service_reminder", service_id: svc.id, role: "professional" }
        );
      }

      // Marcar como enviado
      await client.query(
        `UPDATE service_request SET reminder_sent = true WHERE id = $1`,
        [svc.id]
      );
    }

    if (toRemind.rowCount > 0) {
      console.log(`Recordatorios enviados: ${toRemind.rowCount}`);
    }
  } catch (err) {
    console.error("Reminders error:", err.message);
  } finally {
    client.release();
  }
}

function startExpiryJob() {
  console.log("Service expiry job iniciado (cada 5 min)");
  expireOldServices();
  sendScheduledReminders();
  setInterval(expireOldServices, 5 * 60 * 1000);
  setInterval(sendScheduledReminders, 5 * 60 * 1000);
}

module.exports = { startExpiryJob, expireOldServices };
