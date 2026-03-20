// src/controllers/payments.controller.js
const pool = require("../db/db");

// ── Crear preferencia MP para RECARGA de saldo ────────────────────────────
exports.createMPPreference = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    const { amount_in_cents } = req.body;
    const amount = Number(amount_in_cents);

    if (!amount || amount < 100000) {
      return res.status(400).json({ ok: false, error: "Monto minimo: $1.000 COP" });
    }
    if (amount > 500000000) {
      return res.status(400).json({ ok: false, error: "Monto maximo: $5.000.000 COP" });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(500).json({ ok: false, error: "Pasarela de pagos no configurada" });
    }

    const amountCOP   = amount / 100;
    const reference   = `STYLE-${req.user.id}-${Date.now()}`; // prefijo STYLE = recarga
    const backendUrl  = process.env.BACKEND_URL || "https://styleapp-backend-production.up.railway.app";

    const preference = {
      items: [{
        id:          "recarga-saldo",
        title:       "Recarga de saldo StyleApp",
        description: `Recarga de $${amountCOP.toLocaleString("es-CO")} COP`,
        quantity:    1,
        currency_id: "COP",
        unit_price:  amountCOP,
      }],
      payer: {
        email: req.user.email || "cliente@styleapp.co",
        name:  req.user.name  || "Cliente StyleApp",
      },
      external_reference: reference,
      back_urls: {
        success: `${backendUrl}/payments/mp-result?status=success&ref=${reference}`,
        failure: `${backendUrl}/payments/mp-result?status=failure&ref=${reference}`,
        pending: `${backendUrl}/payments/mp-result?status=pending&ref=${reference}`,
      },
      auto_return:         "approved",
      notification_url:    `${backendUrl}/payments/mp-webhook`,
      statement_descriptor: "STYLEAPP",
      expires:             false,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(preference),
    });

    if (!mpRes.ok) {
      const errBody = await mpRes.text();
      console.error("MP preference error:", errBody);
      return res.status(500).json({ ok: false, error: "Error creando preferencia de pago" });
    }

    const mpData = await mpRes.json();

    // Guardar transaccion pendiente con tipo "recharge"
    try {
      await pool.query(
        `INSERT INTO transactions (user_id, reference, amount_in_cents, status, created_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         ON CONFLICT (reference) DO NOTHING`,
        [req.user.id, reference, amount]
      );
    } catch (dbErr) {
      console.warn("No se pudo guardar transaccion:", dbErr.message);
    }

    return res.json({
      ok:           true,
      checkout_url: mpData.init_point,
      sandbox_url:  mpData.sandbox_init_point,
      preference_id: mpData.id,
      reference,
    });

  } catch (err) {
    console.error("MP PREFERENCE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Error generando pago: " + err.message });
  }
};

// ── Resultado de recarga — MP redirige aqui ───────────────────────────────
exports.mpResult = async (req, res) => {
  const { status, ref, collection_status } = req.query;
  const finalStatus = status || collection_status;

  if ((finalStatus === "success" || finalStatus === "approved") && ref) {
    // Solo acreditar saldo si es una RECARGA (prefijo STYLE-)
    if (String(ref).startsWith("STYLE-")) {
      try {
        await pool.query(
          `UPDATE users
           SET balance = COALESCE(balance, 0) + (
             SELECT amount_in_cents::numeric / 100
             FROM transactions WHERE reference = $1 LIMIT 1
           )
           WHERE id = (SELECT user_id FROM transactions WHERE reference = $1 LIMIT 1)`,
          [ref]
        );
        await pool.query(
          `UPDATE transactions SET status='approved', updated_at=NOW() WHERE reference=$1`,
          [ref]
        );
        console.log(`Recarga aprobada ref=${ref}`);
      } catch (dbErr) {
        console.warn("Error acreditando saldo:", dbErr.message);
      }
    }

    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
        <h2 style="color:#4caf50">✅ Pago aprobado</h2>
        <p>Tu saldo fue recargado exitosamente.</p>
        <p style="color:#888">Vuelve a la app StyleApp para continuar.</p>
      </body></html>
    `);
  }

  if (finalStatus === "pending") {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
        <h2 style="color:#D4AF37">⏳ Pago pendiente</h2>
        <p>El estado de tu pago está siendo procesado.</p>
        <p style="color:#888">Vuelve a la app StyleApp para verificar tu saldo.</p>
      </body></html>
    `);
  }

  return res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
      <h2 style="color:#e53935">❌ Pago no completado</h2>
      <p>El pago no fue procesado. Vuelve a la app e intenta de nuevo.</p>
    </body></html>
  `);
};

// ── Webhook de MercadoPago ────────────────────────────────────────────────
exports.mpWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === "payment" && data?.id) {
      const accessToken = process.env.MP_ACCESS_TOKEN;

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      const payment = await mpRes.json();

      if (payment.status === "approved") {
        const reference    = payment.external_reference;
        const amount       = payment.transaction_amount;

        // ── CRÍTICO: distinguir tipo de pago por prefijo de referencia ──
        if (String(reference).startsWith("STYLE-")) {
          // Es una RECARGA de saldo — acreditar al usuario
          try {
            await pool.query(
              `UPDATE transactions SET status='approved', updated_at=NOW() WHERE reference=$1`,
              [reference]
            );
            await pool.query(
              `UPDATE users SET balance = COALESCE(balance, 0) + $1
               WHERE id = (SELECT user_id FROM transactions WHERE reference=$2 LIMIT 1)`,
              [amount, reference]
            );
            console.log(`MP Webhook: recarga aprobada ref=${reference} amount=${amount}`);
          } catch (dbErr) {
            console.warn("Webhook recarga error:", dbErr.message);
          }

        } else if (String(reference).startsWith("SVC-PRE-")) {
          // Es un PAGO DE SERVICIO anticipado — solo actualizar status, NO tocar saldo
          try {
            await pool.query(
              `UPDATE transactions SET status='approved', updated_at=NOW() WHERE reference=$1`,
              [reference]
            );
            console.log(`MP Webhook: pago aprobado ref=${reference} amount=${amount}`);
          } catch (dbErr) {
            console.warn("Webhook servicio error:", dbErr.message);
          }

        } else {
          // Referencia desconocida — solo loguear
          console.log(`MP Webhook: pago con ref desconocida ${reference}`);
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("MP WEBHOOK ERROR:", err);
    return res.status(500).json({ ok: false });
  }
};

// ── Obtener saldo ─────────────────────────────────────────────────────────
exports.getBalance = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false });
    const result = await pool.query(`SELECT balance FROM users WHERE id=$1`, [req.user.id]);
    return res.json({ ok: true, balance: result.rows[0]?.balance || 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error obteniendo saldo" });
  }
};
