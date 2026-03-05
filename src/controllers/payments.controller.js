// src/controllers/payments.controller.js
const pool = require("../db/db");
const crypto = require("crypto");

// Genera el link de pago Wompi con firma de integridad
exports.createWompiLink = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "No autorizado" });
    }

    const { amount_in_cents } = req.body;

    if (!amount_in_cents || amount_in_cents < 100000) {
      return res.status(400).json({ ok: false, error: "Monto minimo: $1.000 COP" });
    }
    if (amount_in_cents > 500000000) {
      return res.status(400).json({ ok: false, error: "Monto maximo: $5.000.000 COP" });
    }

    // Referencia unica por transaccion
    const reference = `STYLE-${req.user.id}-${Date.now()}`;

    // Firma de integridad: SHA256(reference + amount_in_cents + "COP" + integrity_secret)
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
    if (!integritySecret) {
      return res.status(500).json({ ok: false, error: "Wompi no configurado" });
    }

    const stringToHash = `${reference}${amount_in_cents}COP${integritySecret}`;
    const integrity_signature = crypto
      .createHash("sha256")
      .update(stringToHash)
      .digest("hex");

    // Guardar transaccion pendiente en DB
    await pool.query(
      `INSERT INTO transactions (user_id, reference, amount_in_cents, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       ON CONFLICT (reference) DO NOTHING`,
      [req.user.id, reference, amount_in_cents]
    );

    const redirect_url = `${process.env.APP_URL || "https://styleapp.co"}/payment-result`;

    return res.json({
      ok: true,
      reference,
      integrity_signature,
      redirect_url,
      amount_in_cents,
    });
  } catch (err) {
    console.error("WOMPI LINK ERROR:", err);
    return res.status(500).json({ ok: false, error: "Error generando link de pago" });
  }
};

// Webhook de Wompi — confirma el pago y acredita el saldo
exports.wompiWebhook = async (req, res) => {
  try {
    const { event, data, sent_at, timestamp } = req.body;

    // Verificar firma del webhook
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
    if (eventsSecret) {
      const checksum = req.headers["x-event-checksum"];
      const stringToHash = `${data?.transaction?.id}${timestamp}${event}${eventsSecret}`;
      const expected = crypto.createHash("sha256").update(stringToHash).digest("hex");
      if (checksum !== expected) {
        console.error("WOMPI WEBHOOK: firma invalida");
        return res.status(401).json({ ok: false });
      }
    }

    if (event === "transaction.updated") {
      const transaction = data?.transaction;
      if (!transaction) return res.json({ ok: true });

      const { reference, status, amount_in_cents } = transaction;

      if (status === "APPROVED") {
        // Actualizar transaccion
        await pool.query(
          `UPDATE transactions SET status='approved', wompi_id=$1, updated_at=NOW()
           WHERE reference=$2`,
          [transaction.id, reference]
        );

        // Acreditar saldo al usuario
        await pool.query(
          `UPDATE users SET balance = COALESCE(balance, 0) + $1
           WHERE id = (SELECT user_id FROM transactions WHERE reference=$2 LIMIT 1)`,
          [amount_in_cents / 100, reference]
        );

        console.log(`PAGO APROBADO: ${reference} - $${amount_in_cents / 100} COP`);
      } else if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") {
        await pool.query(
          `UPDATE transactions SET status=$1, updated_at=NOW() WHERE reference=$2`,
          [status.toLowerCase(), reference]
        );
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("WOMPI WEBHOOK ERROR:", err);
    return res.status(500).json({ ok: false });
  }
};

// Consultar saldo del usuario
exports.getBalance = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false });
    const result = await pool.query(
      `SELECT balance FROM users WHERE id=$1`, [req.user.id]
    );
    return res.json({ ok: true, balance: result.rows[0]?.balance || 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error obteniendo saldo" });
  }
};
