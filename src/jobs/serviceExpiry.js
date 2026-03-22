// src/jobs/serviceExpiry.js
const pool = require("../db/db");

const EXPIRY_MINUTES  = 3;
const WARNING_MINUTES = 1;

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

function startExpiryJob() {
  console.log("Service expiry job iniciado (cada 5 min)");
  expireOldServices();
  setInterval(expireOldServices, 5 * 60 * 1000);
}

module.exports = { startExpiryJob, expireOldServices };
