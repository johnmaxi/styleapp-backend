// src/controllers/payments.controller.js
const pool = require("../db/db");
const crypto = require("crypto");

exports.createWompiLink = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    const { amount_in_cents } = req.body;

    if (!amount_in_cents || Number(amount_in_cents) < 100000) {
      return res.status(400).json({ ok: false, error: "Monto minimo: $1.000 COP" });
    }
    if (Number(amount_in_cents) > 500000000) {
      return res.status(400).json({ ok: false, error: "Monto maximo: $5.000.000 COP" });
    }

    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
    if (!integritySecret) {
      console.error("WOMPI_INTEGRITY_SECRET no configurado en variables de entorno");
      return res.status(500).json({ ok: false, error: "Pasarela de pagos no configurada" });
    }

    // Referencia unica
    const reference = `STYLE-${req.user.id}-${Date.now()}`;
    const amountCents = Number(amount_in_cents);

    // Firma SHA256: reference + amount_in_cents + "COP" + integrity_secret
    const stringToHash = `${reference}${amountCents}COP${integritySecret}`;
    const integrity_signature = crypto
      .createHash("sha256")
      .update(stringToHash)
      .digest("hex");

    // Guardar transaccion pendiente
    try {
      await pool.query(
        `INSERT INTO transactions (user_id, reference, amount_in_cents, status, created_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         ON CONFLICT (reference) DO NOTHING`,
        [req.user.id, reference, amountCents]
      );
    } catch (dbErr) {
      // Si la tabla no existe aun, solo loguear — no bloquear el pago
      console.warn("No se pudo guardar transaccion (tabla puede no existir):", dbErr.message);
    }

    const redirect_url = `https://styleapp-backend-production.up.railway.app/payments/result`;

    return res.json({
      ok: true,
      reference,
      integrity_signature,
      redirect_url,
      amount_in_cents: amountCents,
    });
  } catch (err) {
    console.error("WOMPI LINK ERROR:", err);
    return res.status(500).json({ ok: false, error: "Error generando link de pago: " + err.message });
  }
};

// Resultado de pago — Wompi redirige aqui despues del pago
exports.paymentResult = async (req, res) => {
  try {
    const { id: transactionId } = req.query;
    if (!transactionId) {
      return res.send("<h2>Pago procesado. Vuelve a la app Style para ver tu saldo.</h2>");
    }

    // Consultar estado a Wompi directamente
    const wompiRes = await fetch(
      `https://production.wompi.co/v1/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
        },
      }
    );
    const wompiData = await wompiRes.json();
    const transaction = wompiData?.data;

    if (transaction?.status === "APPROVED") {
      const reference = transaction.reference;
      const amountCents = transaction.amount_in_cents;

      // Acreditar saldo
      try {
        await pool.query(
          `UPDATE users SET balance = COALESCE(balance, 0) + $1
           WHERE id = (SELECT user_id FROM transactions WHERE reference=$2 LIMIT 1)`,
          [amountCents / 100, reference]
        );
        await pool.query(
          `UPDATE transactions SET status='approved', wompi_id=$1, updated_at=NOW()
           WHERE reference=$2`,
          [transaction.id, reference]
        );
      } catch (dbErr) {
        console.warn("Error actualizando saldo:", dbErr.message);
      }

      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
          <h2 style="color:#4caf50">Pago aprobado</h2>
          <p>Tu saldo fue recargado exitosamente.</p>
          <p style="color:#888">Vuelve a la app Style para continuar.</p>
        </body></html>
      `);
    } else {
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
          <h2 style="color:#D4AF37">Pago pendiente</h2>
          <p>El estado de tu pago es: ${transaction?.status || "desconocido"}</p>
          <p style="color:#888">Vuelve a la app Style para verificar tu saldo.</p>
        </body></html>
      `);
    }
  } catch (err) {
    console.error("PAYMENT RESULT ERROR:", err);
    return res.send("<h2>Vuelve a la app Style para verificar tu saldo.</h2>");
  }
};

// Webhook de Wompi
exports.wompiWebhook = async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET;

    if (eventsSecret) {
      const checksum = req.headers["x-event-checksum"];
      const stringToHash = `${data?.transaction?.id}${timestamp}${event}${eventsSecret}`;
      const expected = crypto.createHash("sha256").update(stringToHash).digest("hex");
      if (checksum && checksum !== expected) {
        console.error("WOMPI WEBHOOK: firma invalida");
        return res.status(401).json({ ok: false });
      }
    }

    if (event === "transaction.updated") {
      const transaction = data?.transaction;
      if (!transaction) return res.json({ ok: true });
      const { reference, status, amount_in_cents } = transaction;

      if (status === "APPROVED") {
        try {
          await pool.query(
            `UPDATE transactions SET status='approved', wompi_id=$1, updated_at=NOW() WHERE reference=$2`,
            [transaction.id, reference]
          );
          await pool.query(
            `UPDATE users SET balance = COALESCE(balance, 0) + $1
             WHERE id = (SELECT user_id FROM transactions WHERE reference=$2 LIMIT 1)`,
            [amount_in_cents / 100, reference]
          );
        } catch (dbErr) {
          console.warn("Webhook: error actualizando DB:", dbErr.message);
        }
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("WOMPI WEBHOOK ERROR:", err);
    return res.status(500).json({ ok: false });
  }
};

exports.getBalance = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false });
    const result = await pool.query(`SELECT balance FROM users WHERE id=$1`, [req.user.id]);
    return res.json({ ok: true, balance: result.rows[0]?.balance || 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error obteniendo saldo" });
  }
};
