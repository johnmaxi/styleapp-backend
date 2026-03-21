// src/jobs/serviceExpiry.js
// Cron job para expirar servicios automáticamente
// Se ejecuta cada 5 minutos

const pool = require("../db/db");

const EXPIRY_MINUTES        = 10; // servicio expira a los 10 min
const WARNING_MINUTES       = 7;  // aviso al cliente a los 7 min

async function expireOldServices() {
  const client = await pool.connect();
  try {
    // 1. Marcar como expirados los servicios que llevan más de 60 min abiertos
    const expired = await client.query(
      `UPDATE service_request
       SET status = 'cancelled', updated_at = NOW()
       WHERE status = 'open'
         AND requested_at < NOW() - INTERVAL '10 minutes'
       RETURNING id, client_id, service_type, address`
    );

    if (expired.rowCount > 0) {
      console.log(`Expirados ${expired.rowCount} servicios:`, expired.rows.map(r => r.id));

      // Notificar a los clientes que sus servicios expiraron
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
              "⏰ Servicio no encontrado",
              `Tu solicitud de "${service.service_type}" expiró sin recibir profesionales. Puedes crear una nueva.`,
              { type: "service_expired", service_id: service.id }
            );
          }
        } catch {}
      }
    }

    // 2. Notificar a clientes cuyo servicio lleva 30 min sin aceptar (aviso previo)
    const toWarn = await client.query(
      `SELECT sr.id, sr.client_id, sr.service_type, u.push_token
       FROM service_request sr
       JOIN users u ON u.id = sr.client_id
       WHERE sr.status = 'open'
         AND sr.expiry_notified = false
         AND sr.requested_at < NOW() - INTERVAL '7 minutes'
         AND sr.requested_at > NOW() - INTERVAL '10 minutes'`
    );

    for (const service of toWarn.rows) {
      try {
        if (service.push_token) {
          await sendExpoPush(
            [service.push_token],
            "⚠️ Tu servicio lleva 30 min esperando",
            `"${service.service_type}" no ha sido aceptado. Expirará en 30 min. Considera aumentar el precio.`,
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

async function sendExpoPush(tokens, title, body, data = {}) {
  if (!tokens?.length) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map(token => ({
        to: token, sound: "default", title, body, data, priority: "high",
        channelId: "styleapp-notifications",
      }))),
    });
  } catch {}
}

// Iniciar el cron job
function startExpiryJob() {
  console.log("Service expiry job iniciado (cada 5 min)");
  expireOldServices(); // ejecutar inmediatamente al iniciar
  setInterval(expireOldServices, 5 * 60 * 1000); // luego cada 5 min
}

module.exports = { startExpiryJob, expireOldServices };
