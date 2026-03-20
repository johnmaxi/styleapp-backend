// src/controllers/notifications.controller.js
const pool = require("../db/db");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ── Enviar notificación push via Expo ─────────────────────────────────────
async function sendExpoPush(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to:    token,
    sound: "default",
    title,
    body,
    data,
    priority: "high",
    channelId: "styleapp-notifications",
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method:  "POST",
      headers: {
        "Accept":       "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    console.log("Push sent:", result?.data?.length, "messages");
    return result;
  } catch (err) {
    console.error("Push error:", err.message);
  }
}

// ── Calcular distancia entre dos puntos (Haversine) ───────────────────────
function distanceKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Tiempo estimado de viaje (aproximado sin API externa) ─────────────────
function estimatedMinutes(distanceKm) {
  // Velocidad promedio en ciudad: 25 km/h
  const minutes = Math.round((distanceKm / 25) * 60);
  if (minutes < 2)  return "menos de 2 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes/60)}h ${minutes%60}min`;
}

// ── Notificar profesionales cercanos al crear servicio ────────────────────
exports.notifyNearbyProfessionals = async (serviceRequest) => {
  try {
    const { id, service_type, address, price, latitude, longitude, professional_type } = serviceRequest;

    if (!latitude || !longitude) {
      console.log("Notif: sin coordenadas, omitiendo");
      return;
    }

    // Mapear professional_type a role
    const roleMap = {
      profesional:   "barber",
      estilista:     "estilista",
      quiropodologo: "quiropodologo",
    };
    const role = roleMap[professional_type] || "barber";

    // Buscar profesionales activos con push_token y ubicación reciente
    const result = await pool.query(
      `SELECT id, name, push_token, last_latitude, last_longitude
       FROM users
       WHERE role = $1
         AND is_active = true
         AND push_token IS NOT NULL
         AND last_latitude IS NOT NULL
         AND last_longitude IS NOT NULL
         AND last_location_at > NOW() - INTERVAL '2 hours'
       LIMIT 20`,
      [role]
    );

    if (result.rows.length === 0) {
      console.log(`Notif: no hay profesionales activos con token para role=${role}`);
      return;
    }

    // Calcular distancia y filtrar los 5 más cercanos (máx 15 km)
    const withDistance = result.rows
      .map((prof) => ({
        ...prof,
        distance: distanceKm(
          Number(prof.last_latitude), Number(prof.last_longitude),
          Number(latitude), Number(longitude)
        ),
      }))
      .filter((p) => p.distance <= 15)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    if (withDistance.length === 0) {
      console.log("Notif: ningún profesional dentro de 15km");
      return;
    }

    // Enviar notificación personalizada a cada uno con tiempo estimado
    for (const prof of withDistance) {
      const eta  = estimatedMinutes(prof.distance);
      const dist = prof.distance < 1
        ? `${Math.round(prof.distance * 1000)}m`
        : `${prof.distance.toFixed(1)}km`;

      await sendExpoPush(
        [prof.push_token],
        `✂️ Nuevo servicio disponible`,
        `${service_type}\n📍 ${address}\n💰 $${Number(price).toLocaleString("es-CO")} COP\n🚗 ${dist} · ~${eta}`,
        {
          type:       "new_service",
          service_id: id,
          service_type,
          address,
          price:      String(price),
          distance:   String(dist),
          eta,
        }
      );

      console.log(`Notif enviada a ${prof.name} (${dist}, ~${eta})`);
    }

  } catch (err) {
    console.error("notifyNearbyProfessionals error:", err.message);
  }
};

// ── Guardar push token del dispositivo ────────────────────────────────────
exports.savePushToken = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false });
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok: false, error: "Token requerido" });

    await pool.query(
      `UPDATE users SET push_token = $1 WHERE id = $2`,
      [token, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("savePushToken error:", err);
    return res.status(500).json({ ok: false });
  }
};

// ── Actualizar ubicación del profesional (para cálculo de distancia) ──────
exports.updateLocation = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false });
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) return res.status(400).json({ ok: false });

    await pool.query(
      `UPDATE users
       SET last_latitude = $1, last_longitude = $2, last_location_at = NOW()
       WHERE id = $3`,
      [latitude, longitude, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false });
  }
};
