// src/controllers/service-payments.controller.js
// Lógica completa de pagos de servicios por método de pago

const pool = require("../db/db");

const COMMISSION_PCT = 0.15; // 15% comisión app
const PROFESSIONAL_PCT = 0.85; // 85% al profesional

// ── Registrar comisión con trazabilidad ───────────────────────────────────
async function registerCommission(client, {
  service_id, professional_id, client_id,
  total_service, payment_method, payment_status, notes
}) {
  const commission_amt   = Math.round(total_service * COMMISSION_PCT * 100) / 100;
  const professional_amt = Math.round(total_service * PROFESSIONAL_PCT * 100) / 100;

  await client.query(
    `INSERT INTO app_commissions
      (service_id, professional_id, client_id, total_service,
       commission_pct, commission_amt, professional_amt,
       payment_method, payment_status, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
    [
      service_id, professional_id, client_id, total_service,
      COMMISSION_PCT * 100, commission_amt, professional_amt,
      payment_method, payment_status, notes || null,
    ]
  );
  return { commission_amt, professional_amt };
}

// ── Verificar saldo cliente ───────────────────────────────────────────────
exports.checkClientBalance = async (req, res) => {
  try {
    const { service_id } = req.params;
    const client_id = req.user.id;

    const srRes = await pool.query(
      `SELECT price, payment_method FROM service_request WHERE id=$1 AND client_id=$2`,
      [service_id, client_id]
    );
    if (!srRes.rows[0]) {
      return res.status(404).json({ ok: false, error: "Servicio no encontrado" });
    }

    const { price, payment_method } = srRes.rows[0];
    const total     = Number(price);
    const commission = Math.round(total * COMMISSION_PCT * 100) / 100;

    const balRes = await pool.query(`SELECT balance FROM users WHERE id=$1`, [client_id]);
    const balance = Number(balRes.rows[0]?.balance || 0);

    // Lógica de validación de saldo
    let situation;
    if (balance >= total) {
      situation = "sufficient";         // puede pagar todo desde saldo
    } else if (balance >= commission) {
      situation = "partial";            // puede pagar solo la comisión (pago efectivo)
    } else {
      situation = "insufficient";       // debe recargar
    }

    return res.json({
      ok: true,
      balance,
      total,
      commission,
      professional_amt: Math.round(total * PROFESSIONAL_PCT * 100) / 100,
      payment_method,
      situation,
    });
  } catch (err) {
    console.error("CHECK BALANCE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── FINALIZAR SERVICIO con lógica de pago ────────────────────────────────
// Llamado desde barber/active cuando el profesional toca "Finalizar"
exports.finalizeService = async (req, res) => {
  const client = await pool.connect();
  try {
    const { service_id }       = req.params;
    const professional_id      = req.user.id;
    const { payment_confirmed } = req.body; // true/false confirmación de pago

    // Cargar servicio
    const srRes = await client.query(
      `SELECT * FROM service_request WHERE id=$1 AND assigned_barber_id=$2`,
      [service_id, professional_id]
    );
    const service = srRes.rows[0];
    if (!service) {
      return res.status(404).json({ ok: false, error: "Servicio no encontrado" });
    }
    if (service.status === "completed") {
      return res.status(400).json({ ok: false, error: "El servicio ya fue completado" });
    }
    if (service.status !== "arrived") {
      return res.status(400).json({ ok: false, error: "El servicio debe estar en estado 'arrived'" });
    }

    const total          = Number(service.price);
    const commission_amt  = Math.round(total * COMMISSION_PCT * 100) / 100;
    const professional_amt = Math.round(total * PROFESSIONAL_PCT * 100) / 100;
    const payment_method  = service.payment_method;
    const client_id       = service.client_id;

    await client.query("BEGIN");

    // ── EFECTIVO ──────────────────────────────────────────────────────────
    if (payment_method === "efectivo") {
      if (!payment_confirmed) {
        // Profesional NO confirmó recibir efectivo — bloquear
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          blocked: true,
          error: "Debes confirmar que recibiste el efectivo para finalizar el servicio",
          required_amount: total,
        });
      }

      // Profesional confirmó — descontar 15% del saldo del PROFESIONAL (comisión app)
      const profBalRes = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
      const profBalance = Number(profBalRes.rows[0]?.balance || 0);

      if (profBalance >= commission_amt) {
        // Descontar comisión del saldo del profesional
        await client.query(
          `UPDATE users SET balance = balance - $1 WHERE id=$2`,
          [commission_amt, professional_id]
        );
      }
      // Si no tiene saldo suficiente para la comisión, se registra como deuda (nota)
      const notes = profBalance < commission_amt
        ? `Profesional sin saldo para comision. Deuda: $${commission_amt}`
        : `Comision descontada de saldo profesional`;

      await registerCommission(client, {
        service_id, professional_id, client_id, total_service: total,
        payment_method: "efectivo", payment_status: "completed", notes,
      });
    }

    // ── TARJETA (saldo suficiente) ────────────────────────────────────────
    else if (payment_method === "tarjeta") {
      const balRes = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [client_id]);
      const clientBalance = Number(balRes.rows[0]?.balance || 0);

      if (clientBalance >= total) {
        // Opción 1: descontar total del saldo del cliente → pagar profesional
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [total, client_id]);
        await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [professional_amt, professional_id]);

        await registerCommission(client, {
          service_id, professional_id, client_id, total_service: total,
          payment_method: "tarjeta", payment_status: "completed",
          notes: "Pagado desde saldo cliente",
        });

      } else if (clientBalance >= commission_amt) {
        // Opción parcial: cliente paga comisión desde saldo, resto en efectivo
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [commission_amt, client_id]);
        await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [professional_amt, professional_id]);

        await registerCommission(client, {
          service_id, professional_id, client_id, total_service: total,
          payment_method: "tarjeta_parcial", payment_status: "completed",
          notes: `Comision de saldo + efectivo al profesional: $${professional_amt}`,
        });

      } else {
        // Saldo insuficiente — no finalizar
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          blocked: true,
          error: "Saldo del cliente insuficiente para cubrir la comision",
          client_balance: clientBalance,
          required_commission: commission_amt,
        });
      }
    }

    // ── PSE (retenido en app — Opción 1) ─────────────────────────────────
    else if (payment_method === "pse") {
      // El dinero ya fue retenido en la app vía MercadoPago
      // Al finalizar, liberar 85% al profesional
      await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [professional_amt, professional_id]);

      await registerCommission(client, {
        service_id, professional_id, client_id, total_service: total,
        payment_method: "pse", payment_status: "completed",
        notes: "Liberado desde retención MP al finalizar servicio",
      });
    }

    // ── NEQUI ─────────────────────────────────────────────────────────────
    else if (payment_method === "nequi") {
      if (!payment_confirmed) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          blocked: true,
          error: "Debes confirmar que recibiste el pago por Nequi para finalizar",
          required_amount: total,
        });
      }

      // Profesional confirmó recibir Nequi — descontar 15% de su saldo como comisión
      const profBalRes = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
      const profBalance = Number(profBalRes.rows[0]?.balance || 0);

      if (profBalance >= commission_amt) {
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [commission_amt, professional_id]);
      }

      const notes = profBalance < commission_amt
        ? `Profesional sin saldo para comision. Deuda: $${commission_amt}`
        : `Comision descontada de saldo profesional`;

      await registerCommission(client, {
        service_id, professional_id, client_id, total_service: total,
        payment_method: "nequi", payment_status: "completed", notes,
      });
    }

    // ── DAVIPLATA (igual que Nequi) ───────────────────────────────────────
    else if (payment_method === "daviplata") {
      if (!payment_confirmed) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          blocked: true,
          error: "Debes confirmar que recibiste el pago por Daviplata para finalizar",
          required_amount: total,
        });
      }

      const profBalRes = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
      const profBalance = Number(profBalRes.rows[0]?.balance || 0);

      if (profBalance >= commission_amt) {
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [commission_amt, professional_id]);
      }

      await registerCommission(client, {
        service_id, professional_id, client_id, total_service: total,
        payment_method: "daviplata", payment_status: "completed",
        notes: profBalance < commission_amt
          ? `Deuda comision: $${commission_amt}`
          : "Comision descontada de saldo profesional",
      });
    }

    // ── Completar servicio ────────────────────────────────────────────────
    await client.query(
      `UPDATE service_request SET status='completed', updated_at=NOW() WHERE id=$1`,
      [service_id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Servicio finalizado correctamente",
      breakdown: {
        total,
        professional_amt,
        commission_amt,
        payment_method,
      },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("FINALIZE SERVICE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Error finalizando el servicio: " + err.message });
  } finally {
    client.release();
  }
};

// ── Crear preferencia MP para pago de servicio (PSE/Tarjeta opción 2) ────
exports.createServicePayment = async (req, res) => {
  try {
    const { service_id } = req.params;
    const client_id = req.user.id;

    const srRes = await pool.query(
      `SELECT * FROM service_request WHERE id=$1 AND client_id=$2`,
      [service_id, client_id]
    );
    const service = srRes.rows[0];
    if (!service) return res.status(404).json({ ok: false, error: "Servicio no encontrado" });

    const total = Number(service.price);
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return res.status(500).json({ ok: false, error: "Pasarela no configurada" });

    const reference  = `SVC-${service_id}-${client_id}-${Date.now()}`;
    const backendUrl = process.env.BACKEND_URL || "https://styleapp-backend-production.up.railway.app";

    const preference = {
      items: [{
        id:          `service-${service_id}`,
        title:       `Pago de servicio StyleApp #${service_id}`,
        description: service.service_type || "Servicio de belleza a domicilio",
        quantity:    1,
        currency_id: "COP",
        unit_price:  total,
      }],
      payer: { email: req.user.email || "cliente@styleapp.co" },
      external_reference: reference,
      back_urls: {
        success: `${backendUrl}/payments/service-result?status=success&service_id=${service_id}&ref=${reference}`,
        failure: `${backendUrl}/payments/service-result?status=failure&service_id=${service_id}`,
        pending: `${backendUrl}/payments/service-result?status=pending&service_id=${service_id}`,
      },
      auto_return:      "approved",
      notification_url: `${backendUrl}/payments/mp-webhook`,
      metadata: { service_id, client_id, type: "service_payment" },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(preference),
    });

    if (!mpRes.ok) {
      const err = await mpRes.text();
      return res.status(500).json({ ok: false, error: "Error MP: " + err });
    }

    const mpData = await mpRes.json();

    // Marcar servicio como pago retenido
    await pool.query(
      `UPDATE service_request SET payment_status='retained', updated_at=NOW() WHERE id=$1`,
      [service_id]
    );

    return res.json({
      ok:           true,
      checkout_url: mpData.init_point,
      sandbox_url:  mpData.sandbox_init_point,
      reference,
    });
  } catch (err) {
    console.error("SERVICE PAYMENT ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Resultado pago de servicio ────────────────────────────────────────────
exports.servicePaymentResult = async (req, res) => {
  const { status, service_id, ref } = req.query;

  if (status === "success" && service_id) {
    try {
      await pool.query(
        `UPDATE service_request SET payment_status='paid', updated_at=NOW() WHERE id=$1`,
        [service_id]
      );
    } catch (e) {
      console.warn("Error actualizando payment_status:", e.message);
    }
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
        <h2 style="color:#4caf50">✅ Pago recibido</h2>
        <p>Tu pago fue procesado. El dinero queda reservado hasta que el profesional finalice el servicio.</p>
        <p style="color:#888;font-size:13px">Vuelve a la app StyleApp.</p>
      </body></html>
    `);
  }

  return res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d0d0d;color:#fff">
      <h2 style="color:#e53935">❌ Pago no completado</h2>
      <p>Vuelve a la app e intenta de nuevo.</p>
    </body></html>
  `);
};
