// src/controllers/service-payments.controller.js
const pool = require("../db/db");

const COMMISSION_PCT   = 0.15;
const PROFESSIONAL_PCT = 0.85;

// ── Registrar comisión ────────────────────────────────────────────────────
async function registerCommission(client, { service_id, professional_id, client_id, total_service, payment_method, payment_status, notes }) {
  const commission_amt   = Math.round(total_service * COMMISSION_PCT * 100) / 100;
  const professional_amt = Math.round(total_service * PROFESSIONAL_PCT * 100) / 100;
  await client.query(
    `INSERT INTO app_commissions
      (service_id, professional_id, client_id, total_service,
       commission_pct, commission_amt, professional_amt,
       payment_method, payment_status, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
    [service_id, professional_id, client_id, total_service,
     COMMISSION_PCT * 100, commission_amt, professional_amt,
     payment_method, payment_status, notes || null]
  );
  return { commission_amt, professional_amt };
}

// ── 1. Crear checkout MP para PSE/Tarjeta ANTES de crear el servicio ──────
exports.createServiceCheckout = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, error: "No autorizado" });

    const { amount_in_cents, payment_method, service_type } = req.body;
    const amount = Number(amount_in_cents);

    if (!amount || amount < 1000) {
      return res.status(400).json({ ok: false, error: "Monto invalido" });
    }
    if (!["pse", "tarjeta"].includes(payment_method)) {
      return res.status(400).json({ ok: false, error: "Solo PSE o Tarjeta" });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return res.status(500).json({ ok: false, error: "Pasarela no configurada" });

    const amountCOP  = amount / 100;
    const reference  = `SVC-PRE-${req.user.id}-${Date.now()}`;
    const backendUrl = process.env.BACKEND_URL || "https://styleapp-backend-production.up.railway.app";

    const preference = {
      items: [{
        id:          "service-payment",
        title:       `Pago servicio StyleApp — ${service_type || "Servicio de belleza"}`,
        description: `Pago por ${payment_method.toUpperCase()} — precio fijo sin contraofertas`,
        quantity:    1,
        currency_id: "COP",
        unit_price:  amountCOP,
      }],
      payer: { email: req.user.email || "cliente@styleapp.co" },
      external_reference: reference,
      back_urls: {
        success: `${backendUrl}/payments/service-result?status=success&ref=${reference}`,
        failure: `${backendUrl}/payments/service-result?status=failure&ref=${reference}`,
        pending: `${backendUrl}/payments/service-result?status=pending&ref=${reference}`,
      },
      auto_return:      "approved",
      notification_url: `${backendUrl}/payments/mp-webhook`,
      metadata: { type: "service_pre_payment", client_id: req.user.id, payment_method },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify(preference),
    });

    if (!mpRes.ok) {
      const err = await mpRes.text();
      console.error("MP service checkout error:", err);
      return res.status(500).json({ ok: false, error: "Error creando pago" });
    }

    const mpData = await mpRes.json();

    // Guardar referencia pendiente en BD para verificar luego
    try {
      await pool.query(
        `INSERT INTO transactions (user_id, reference, amount_in_cents, status, created_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         ON CONFLICT (reference) DO NOTHING`,
        [req.user.id, reference, amount]
      );
    } catch (dbErr) {
      console.warn("No se pudo guardar transaccion previa:", dbErr.message);
    }

    return res.json({
      ok:           true,
      checkout_url: mpData.init_point,
      sandbox_url:  mpData.sandbox_init_point,
      reference,
    });
  } catch (err) {
    console.error("SERVICE CHECKOUT ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── 2. Verificar si el pago de servicio fue aprobado ─────────────────────
exports.verifyServicePayment = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) return res.status(400).json({ ok: false, error: "Referencia requerida" });

    // Buscar en la tabla de transacciones
    const result = await pool.query(
      `SELECT status, amount_in_cents FROM transactions WHERE reference = $1`,
      [reference]
    );

    if (!result.rows[0]) {
      return res.json({ ok: true, paid: false, status: "not_found" });
    }

    const { status, amount_in_cents } = result.rows[0];
    const paid = status === "approved";

    // Si aún está pendiente, consultar directamente a MP
    if (!paid) {
      const accessToken = process.env.MP_ACCESS_TOKEN;
      try {
        const mpRes = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${reference}`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        const mpData = await mpRes.json();
        const payment = mpData?.results?.[0];

        if (payment?.status === "approved") {
          // Actualizar en BD
          await pool.query(
            `UPDATE transactions SET status='approved', updated_at=NOW() WHERE reference=$1`,
            [reference]
          );
          return res.json({ ok: true, paid: true, status: "approved", amount_in_cents });
        }
      } catch (mpErr) {
        console.warn("Error consultando MP:", mpErr.message);
      }
    }

    return res.json({ ok: true, paid, status, amount_in_cents });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── 3. Resultado de pago — MP redirige aquí ───────────────────────────────
exports.servicePaymentResult = async (req, res) => {
  const { status, ref, payment_id, collection_status } = req.query;
  const finalStatus = status || collection_status;

  // Actualizar BD si viene como éxito
  if (ref && (finalStatus === "success" || finalStatus === "approved")) {
    try {
      await pool.query(
        `UPDATE transactions SET status='approved', updated_at=NOW() WHERE reference=$1`,
        [ref]
      );
      console.log(`service-result: pago aprobado ref=${ref}`);
    } catch (e) { console.warn("Error actualizando transaccion:", e.message); }
  }

  // Para TODOS los casos mostrar página que se cierra sola
  // La app verifica automáticamente via polling — no depende de esta página
  const isSuccess = finalStatus === "success" || finalStatus === "approved";
  const isPending = finalStatus === "pending";

  const emoji   = isSuccess ? "✅" : isPending ? "⏳" : "ℹ️";
  const title   = isSuccess ? "Pago procesado"  : isPending ? "Pago en proceso" : "Procesando...";
  const msg     = isSuccess ? "Vuelve a la app para continuar." : "Vuelve a la app StyleApp.";
  const color   = isSuccess ? "#4caf50" : isPending ? "#D4AF37" : "#2196F3";

  return res.send(`
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; text-align: center; padding: 40px 20px;
               background: #0d0d0d; color: #fff; margin: 0; }
        h2   { color: ${color}; font-size: 24px; margin-bottom: 16px; }
        p    { color: #aaa; font-size: 15px; line-height: 1.5; }
        .btn { display: inline-block; margin-top: 24px; padding: 14px 28px;
               background: ${color}; color: #000; border-radius: 10px;
               font-weight: bold; font-size: 16px; text-decoration: none;
               cursor: pointer; border: none; }
      </style>
    </head>
    <body>
      <div style="font-size:48px">${emoji}</div>
      <h2>${title}</h2>
      <p>${msg}</p>
      <p style="color:#555;font-size:12px">Ref: ${ref || "-"}</p>
      <button class="btn" onclick="closePage()">
        ✓ Listo — Volver a la app
      </button>
      <script>
        function closePage() {
          // Intentar cerrar de múltiples formas
          try { window.close(); } catch(e) {}
          try { window.history.go(-(window.history.length)); } catch(e) {}
          try { location.replace("about:blank"); } catch(e) {}
        }
        // Cerrar automáticamente después de 2s
        setTimeout(closePage, 2000);
      </script>
    </body>
    </html>
  `);
};

// ── 4. Finalizar servicio con lógica de pago y comisiones ─────────────────
exports.finalizeService = async (req, res) => {
  const client = await pool.connect();
  try {
    const { service_id }        = req.params;
    const professional_id       = req.user.id;
    const { payment_confirmed } = req.body;

    const srRes = await client.query(
      `SELECT * FROM service_request WHERE id=$1 AND assigned_barber_id=$2`,
      [service_id, professional_id]
    );
    const service = srRes.rows[0];
    if (!service)                    return res.status(404).json({ ok: false, error: "Servicio no encontrado" });
    if (service.status === "completed") return res.status(400).json({ ok: false, error: "El servicio ya fue completado" });
    if (service.status !== "arrived")   return res.status(400).json({ ok: false, error: "El servicio debe estar en estado arrived" });

    const total           = Number(service.price);
    const commission_amt  = Math.round(total * COMMISSION_PCT * 100) / 100;
    const professional_amt = Math.round(total * PROFESSIONAL_PCT * 100) / 100;
    const payment_method  = service.payment_method;
    const client_id       = service.client_id;

    await client.query("BEGIN");

    // ── EFECTIVO ──────────────────────────────────────────────────────────
    if (payment_method === "efectivo") {
      if (!payment_confirmed) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false, blocked: true,
          error: "Debes confirmar que recibiste el efectivo para finalizar",
          required_amount: total,
        });
      }
      // Descontar comisión del saldo del PROFESIONAL
      const profBalRes  = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
      const profBalance = Number(profBalRes.rows[0]?.balance || 0);
      if (profBalance >= commission_amt) {
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [commission_amt, professional_id]);
      }
      await registerCommission(client, {
        service_id, professional_id, client_id, total_service: total,
        payment_method: "efectivo", payment_status: "completed",
        notes: profBalance >= commission_amt
          ? "Comision descontada del saldo del profesional"
          : `Profesional sin saldo. Deuda comision: $${commission_amt}`,
      });
    }

    // ── NEQUI ─────────────────────────────────────────────────────────────
    else if (payment_method === "nequi") {
      if (!payment_confirmed) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false, blocked: true,
          error: "Debes confirmar que recibiste el pago por Nequi para finalizar",
          required_amount: total,
        });
      }
      // Descontar comisión del saldo del PROFESIONAL
      const profBalRes  = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
      const profBalance = Number(profBalRes.rows[0]?.balance || 0);
      if (profBalance >= commission_amt) {
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [commission_amt, professional_id]);
      }
      await registerCommission(client, {
        service_id, professional_id, client_id, total_service: total,
        payment_method: "nequi", payment_status: "completed",
        notes: profBalance >= commission_amt
          ? "Comision descontada del saldo del profesional"
          : `Profesional sin saldo. Deuda comision: $${commission_amt}`,
      });
    }

    // ── PSE / TARJETA — dinero cobrado por MP, solo distribuir ─────────────
    else if (payment_method === "pse" || payment_method === "tarjeta") {
      // IMPORTANTE: NO tocar el saldo del cliente — MP ya cobró directamente
      // Solo acreditar 85% al profesional, 15% queda en la app

      // Verificar que el pago fue confirmado
      if (service.payment_status !== "paid") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false, blocked: true,
          error: "El pago del servicio no está confirmado. Contacta al soporte.",
        });
      }

      // Acreditar SOLO el 85% al profesional — NO modificar saldo del cliente
      await client.query(
        `UPDATE users SET balance = balance + $1 WHERE id = $2`,
        [professional_amt, professional_id]
      );

      await registerCommission(client, {
        service_id, professional_id, client_id,
        total_service:  total,
        payment_method, payment_status: "completed",
        notes: `MP cobró $${total} directamente. Liberado $${professional_amt} (85%) al profesional. Comisión app: $${commission_amt} (15%).`,
      });
    }

    else {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: `Método de pago no soportado: ${payment_method}` });
    }

    // ── Completar el servicio ─────────────────────────────────────────────
    await client.query(
      `UPDATE service_request SET status='completed', updated_at=NOW() WHERE id=$1`,
      [service_id]
    );
    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Servicio finalizado correctamente",
      breakdown: { total, professional_amt, commission_amt, payment_method },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("FINALIZE SERVICE ERROR:", err);
    return res.status(500).json({ ok: false, error: "Error finalizando el servicio: " + err.message });
  } finally {
    client.release();
  }
};

// ── 5. Verificar saldo del cliente ────────────────────────────────────────
exports.checkClientBalance = async (req, res) => {
  try {
    const { service_id } = req.params;
    const srRes = await pool.query(`SELECT price, payment_method FROM service_request WHERE id=$1`, [service_id]);
    if (!srRes.rows[0]) return res.status(404).json({ ok: false, error: "Servicio no encontrado" });

    const { price, payment_method } = srRes.rows[0];
    const total      = Number(price);
    const commission = Math.round(total * COMMISSION_PCT * 100) / 100;
    const balRes     = await pool.query(`SELECT balance FROM users WHERE id=$1`, [req.user.id]);
    const balance    = Number(balRes.rows[0]?.balance || 0);

    return res.json({
      ok: true, balance, total, commission,
      professional_amt: Math.round(total * PROFESSIONAL_PCT * 100) / 100,
      payment_method,
      situation: balance >= total ? "sufficient" : balance >= commission ? "partial" : "insufficient",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Cancelar servicio con lógica de penalización ──────────────────────────
// Sin penalización si status=open (nadie fue afectado)
// Con penalización 15% si status=accepted/on_route/arrived
exports.cancelService = async (req, res) => {
  const client = await pool.connect();
  try {
    const { service_id } = req.params;
    const client_id      = req.user.id;

    const srRes = await client.query(
      `SELECT * FROM service_request WHERE id=$1 AND client_id=$2`,
      [service_id, client_id]
    );
    const service = srRes.rows[0];
    if (!service) return res.status(404).json({ ok: false, error: "Servicio no encontrado" });

    const status         = service.status;
    const total          = Number(service.price);
    const payment_method = service.payment_method;
    const professional_id = service.assigned_barber_id;

    const PENALTY_PCT     = 0.15;
    const APP_PCT         = 0.10;
    const PROF_PCT        = 0.05;
    const penalty_amt     = Math.round(total * PENALTY_PCT * 100) / 100;
    const app_amt         = Math.round(total * APP_PCT    * 100) / 100;
    const prof_amt        = Math.round(total * PROF_PCT   * 100) / 100;

    // Sin penalización si el servicio aún está abierto
    const HAS_PENALTY = ["accepted", "on_route", "arrived"].includes(status);

    await client.query("BEGIN");

    if (HAS_PENALTY && total > 0) {
      const MP_METHODS = ["pse", "tarjeta"];

      if (!MP_METHODS.includes(payment_method)) {
        // Efectivo / Nequi — descontar del saldo del cliente
        const balRes     = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [client_id]);
        const clientBal  = Number(balRes.rows[0]?.balance || 0);

        if (clientBal >= penalty_amt) {
          await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [penalty_amt, client_id]);
        }
        // Pagar 5% al profesional si estaba asignado
        if (professional_id) {
          await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [prof_amt, professional_id]);
        }
      } else {
        // PSE / Tarjeta — el dinero ya estaba en la app (MP)
        // Retornar 85% al cliente, conservar 15%
        const refund_amt = Math.round(total * 0.85 * 100) / 100;
        await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [refund_amt, client_id]);
        if (professional_id) {
          await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [prof_amt, professional_id]);
        }
      }

      // Registrar penalización
      await client.query(
        `INSERT INTO app_commissions
         (service_id, professional_id, client_id, total_service,
          commission_pct, commission_amt, professional_amt,
          payment_method, payment_status, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,NOW(),NOW())`,
        [
          service_id, professional_id || null, client_id, total,
          PENALTY_PCT * 100, app_amt, prof_amt,
          payment_method,
          `Penalización por cancelación. App: $${app_amt}, Profesional: $${prof_amt}`,
        ]
      );
    }

    // Cancelar el servicio
    await client.query(
      `UPDATE service_request SET status='cancelled', updated_at=NOW() WHERE id=$1`,
      [service_id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      penalized: HAS_PENALTY,
      penalty_amt: HAS_PENALTY ? penalty_amt : 0,
      message: HAS_PENALTY
        ? `Servicio cancelado. Se descontaron $${penalty_amt.toLocaleString("es-CO")} (15%) de penalización.`
        : "Servicio cancelado sin penalización.",
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CANCEL SERVICE ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
};
