// src/controllers/service-payments.controller.js
const pool = require("../db/db");

const COMMISSION_PCT   = 0.15;
const PROFESSIONAL_PCT = 0.85;
const MIN_BALANCE_TO_ACCEPT = 5000;

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

// ── Verificar si el profesional puede aceptar servicios (saldo suficiente) ─
exports.checkCanAcceptServices = async (req, res) => {
  try {
    const result = await pool.query(`SELECT balance FROM users WHERE id=$1`, [req.user.id]);
    const balance = Number(result.rows[0]?.balance || 0);
    return res.json({
      ok: true,
      balance,
      can_accept: balance >= MIN_BALANCE_TO_ACCEPT,
      min_required: MIN_BALANCE_TO_ACCEPT,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Finalizar servicio — descuenta 15% del saldo del profesional ──────────
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
    if (!service)                       return res.status(404).json({ ok: false, error: "Servicio no encontrado" });
    if (service.status === "completed") return res.status(400).json({ ok: false, error: "El servicio ya fue completado" });
    if (service.status !== "arrived")   return res.status(400).json({ ok: false, error: "El servicio debe estar en estado arrived" });

    const total            = Number(service.price);
    const commission_amt   = Math.round(total * COMMISSION_PCT * 100) / 100;
    const professional_amt = Math.round(total * PROFESSIONAL_PCT * 100) / 100;
    const payment_method   = service.payment_method;
    const client_id        = service.client_id;

    if (!["efectivo", "nequi"].includes(payment_method)) {
      return res.status(400).json({ ok: false, error: `Método de pago no soportado: ${payment_method}` });
    }

    if (!payment_confirmed) {
      return res.status(400).json({
        ok: false, blocked: true,
        error: payment_method === "efectivo"
          ? "Debes confirmar que recibiste el efectivo para finalizar"
          : "Debes confirmar que recibiste el pago por Nequi para finalizar",
        required_amount: total,
      });
    }

    await client.query("BEGIN");

    // Descontar comisión del saldo del PROFESIONAL
    const profBalRes  = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
    const profBalance = Number(profBalRes.rows[0]?.balance || 0);
    const newBalance  = profBalance - commission_amt;

    await client.query(`UPDATE users SET balance = $1 WHERE id=$2`, [newBalance, professional_id]);

    await registerCommission(client, {
      service_id, professional_id, client_id, total_service: total,
      payment_method, payment_status: "completed",
      notes: `Comisión 15% descontada del saldo del profesional. Saldo anterior: $${profBalance}, nuevo saldo: $${newBalance}`,
    });

    await client.query(
      `UPDATE service_request SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [service_id]
    );
    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Servicio finalizado correctamente",
      client_id: service.client_id,
      new_balance: newBalance,
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

// ── Cancelar servicio (cliente) con penalización 15% ───────────────────────
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

    const status           = service.status;
    const total             = Number(service.price);
    const payment_method    = service.payment_method;
    const professional_id   = service.assigned_barber_id;

    const PENALTY_PCT  = 0.15;
    const APP_PCT      = 0.10;
    const PROF_PCT     = 0.05;
    const penalty_amt  = Math.round(total * PENALTY_PCT * 100) / 100;
    const app_amt      = Math.round(total * APP_PCT    * 100) / 100;
    const prof_amt     = Math.round(total * PROF_PCT   * 100) / 100;

    const HAS_PENALTY = ["accepted", "on_route", "arrived"].includes(status);

    await client.query("BEGIN");

    if (HAS_PENALTY && total > 0) {
      const balRes    = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [client_id]);
      const clientBal = Number(balRes.rows[0]?.balance || 0);

      if (clientBal >= penalty_amt) {
        await client.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [penalty_amt, client_id]);
      }
      if (professional_id) {
        await client.query(`UPDATE users SET balance = balance + $1 WHERE id=$2`, [prof_amt, professional_id]);
      }

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

// ── Cancelar servicio por parte del PROFESIONAL — penalización 15% ────────
exports.cancelServiceByProfessional = async (req, res) => {
  const client = await pool.connect();
  try {
    const { service_id }  = req.params;
    const professional_id = req.user.id;

    const srRes = await client.query(
      `SELECT * FROM service_request WHERE id=$1 AND assigned_barber_id=$2`,
      [service_id, professional_id]
    );
    const service = srRes.rows[0];
    if (!service) {
      return res.status(404).json({ ok: false, error: "Servicio no encontrado o no asignado a ti" });
    }

    const status         = service.status;
    const total           = Number(service.price);
    const payment_method  = service.payment_method;
    const client_id       = service.client_id;

    const HAS_PENALTY = ["accepted", "on_route", "arrived"].includes(status);
    const PENALTY_PCT = 0.15;
    const penalty_amt = Math.round(total * PENALTY_PCT * 100) / 100;

    await client.query("BEGIN");

    if (HAS_PENALTY && total > 0) {
      const profRes = await client.query(`SELECT balance FROM users WHERE id=$1 FOR UPDATE`, [professional_id]);
      const profBal = Number(profRes.rows[0]?.balance || 0);
      const newBalance = profBal - penalty_amt;

      await client.query(`UPDATE users SET balance = $1 WHERE id=$2`, [newBalance, professional_id]);

      await client.query(
        `INSERT INTO app_commissions
         (service_id, professional_id, client_id, total_service,
          commission_pct, commission_amt, professional_amt,
          payment_method, payment_status, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,NOW(),NOW())`,
        [
          service_id, professional_id, client_id, total,
          PENALTY_PCT * 100, penalty_amt, 0,
          payment_method,
          `Cancelación por profesional. Penalización 15%: $${penalty_amt}`,
        ]
      );

      try {
        const clientUserRes = await client.query(`SELECT push_token FROM users WHERE id=$1`, [client_id]);
        const token = clientUserRes.rows[0]?.push_token;
        if (token) {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{
              to: token, sound: "default",
              title: "⚠️ Profesional canceló el servicio",
              body: "El profesional canceló tu solicitud. Puedes solicitar un nuevo servicio.",
              priority: "high",
              channelId: "styleapp-notifications",
              data: { type: "service_cancelled_by_professional", service_id },
            }]),
          });
        }
      } catch {}
    }

    await client.query(
      `UPDATE service_request SET status='cancelled', assigned_barber_id=NULL, updated_at=NOW() WHERE id=$1`,
      [service_id]
    );

    await client.query("COMMIT");

    return res.json({
      ok:          true,
      penalized:   HAS_PENALTY,
      penalty_amt: HAS_PENALTY ? penalty_amt : 0,
      message:     HAS_PENALTY
        ? `Servicio cancelado. Se descontaron $${penalty_amt.toLocaleString("es-CO")} (15%) de tu saldo.`
        : "Servicio cancelado sin penalización.",
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CANCEL BY PROFESSIONAL ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
};
