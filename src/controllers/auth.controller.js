// src/controllers/auth.controller.js
const pool   = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");

const VALID_ROLES        = ["client", "barber", "estilista", "quiropodologo", "admin"];
const PROFESSIONAL_ROLES = ["barber", "estilista", "quiropodologo"];

// ── Notificar al admin cuando se registra un profesional ──────────────────
async function notifyAdminNewProfessional(professional) {
  try {
    // Obtener todos los admins con push_token
    const admins = await pool.query(
      `SELECT push_token FROM users WHERE role='admin' AND push_token IS NOT NULL`
    );
    if (!admins.rows.length) return;

    const tokens = admins.rows.map(a => a.push_token);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map(token => ({
        to:        token,
        title:     "🔔 Nuevo registro de profesional",
        body:      `${professional.name} (${professional.role}) solicita activación de cuenta.`,
        data:      { type: "new_professional", professional_id: professional.id },
        sound:     "default",
        priority:  "high",
        channelId: "styleapp-urgent",
      }))),
    });
  } catch (e) {
    console.warn("notifyAdminNewProfessional error:", e.message);
  }
}

exports.register = async (req, res) => {
  try {
    const {
      name, email, password, phone, role = "client", gender,
      address, city, neighborhood,
      payment_methods, payment_method, account_number,
      document_type, document_number, portfolio = [],
      cedula_doc, diploma_doc, id_front, id_back, diploma,
      profile_photo, antecedentes_doc,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Nombre, email y contrasena son obligatorios" });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ ok: false, error: `Rol invalido. Permitidos: ${VALID_ROLES.join(", ")}` });
    }

    const existing = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ ok: false, error: "El email ya esta registrado" });
    }

    const isProfessional  = PROFESSIONAL_ROLES.includes(role);
    const hash            = await bcrypt.hash(password, 10);
    const resolvedIdFront = cedula_doc || id_front || null;
    const resolvedDiploma = diploma_doc || diploma || null;
    const resolvedPayment = Array.isArray(payment_methods)
      ? payment_methods.join(",")
      : payment_method || null;

    // Profesionales inician con is_active=false — esperan aprobación del admin
    const isActive = isProfessional ? false : true;

    const result = await pool.query(
      `INSERT INTO users
       (name, email, password, role, phone, gender,
        address, city, neighborhood,
        payment_method, account_number,
        document_type, document_number,
        portfolio, id_front, id_back, profile_photo, diploma,
        is_active, registration_status, antecedentes_doc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id, name, email, role, phone, gender,
                 address, city, neighborhood, profile_photo, is_active`,
      [
        name, email, hash, role, phone || null, gender || null,
        address || null, city || null, neighborhood || null,
        resolvedPayment, account_number || null,
        document_type || null, document_number || null,
        JSON.stringify(portfolio || []),
        resolvedIdFront, id_back || null, profile_photo || null, resolvedDiploma,
        isActive,
        isProfessional ? "pending" : "approved",
        antecedentes_doc || null,
      ]
    );

    const newUser = result.rows[0];

    // Notificar al admin si es profesional
    if (isProfessional) {
      notifyAdminNewProfessional(newUser).catch(() => {});
    }

    return res.status(201).json({
      ok:   true,
      user: newUser,
      message: isProfessional
        ? "Registro exitoso. Tu cuenta esta en revision. El administrador validara tu identidad, antecedentes y diplomas en las proximas 24 horas. Recibiras una notificacion con el resultado."
        : "Registro exitoso. Bienvenido a Style!",
      pending_validation: isProfessional,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ ok: false, error: "Error registrando usuario: " + error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email y contrasena son requeridos" });
    }

    const result = await pool.query(
      `SELECT id, email, password, role, gender, name, profile_photo,
              rating, phone, address, city, neighborhood,
              is_active, registration_status, registration_rejection_reason
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales invalidas" });
    }

    const user         = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Credenciales invalidas" });
    }

    // Bloquear login a profesionales con registro pendiente o rechazado
    if (PROFESSIONAL_ROLES.includes(user.role)) {
      if (user.registration_status === "pending") {
        return res.status(403).json({
          error: "Tu cuenta esta pendiente de aprobacion. Recibiras una notificacion en las proximas 24 horas.",
          registration_status: "pending",
        });
      }
      if (user.registration_status === "rejected") {
        return res.status(403).json({
          error: `Tu registro fue rechazado. Motivo: ${user.registration_rejection_reason || "Documentos invalidos"}. Contacta al soporte.`,
          registration_status: "rejected",
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    return res.json({
      token,
      user: {
        id:            user.id,
        email:         user.email,
        role:          user.role,
        gender:        user.gender,
        name:          user.name,
        profile_photo: user.profile_photo,
        rating:        user.rating,
        phone:         user.phone,
        address:       user.address,
        city:          user.city,
        neighborhood:  user.neighborhood,
        is_active:     user.is_active,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};

// ── Aprobar o rechazar registro de profesional (solo admin) ───────────────
exports.reviewProfessional = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Solo administradores" });
    }

    const { professional_id }  = req.params;
    const { action, reason }   = req.body; // action: "approve" | "reject"

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ ok: false, error: "Accion invalida: approve o reject" });
    }
    if (action === "reject" && !reason) {
      return res.status(400).json({ ok: false, error: "Debes indicar el motivo del rechazo" });
    }

    const profRes = await pool.query(
      `SELECT id, name, role, push_token, registration_status FROM users WHERE id=$1`,
      [professional_id]
    );
    const prof = profRes.rows[0];
    if (!prof) return res.status(404).json({ ok: false, error: "Profesional no encontrado" });
    if (!PROFESSIONAL_ROLES.includes(prof.role)) {
      return res.status(400).json({ ok: false, error: "El usuario no es un profesional" });
    }

    if (action === "approve") {
      await pool.query(
        `UPDATE users
         SET is_active=true, registration_status='approved',
             registration_rejection_reason=NULL, registration_reviewed_at=NOW()
         WHERE id=$1`,
        [professional_id]
      );

      // Notificar al profesional
      if (prof.push_token) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            to:        prof.push_token,
            title:     "✅ Registro aprobado",
            body:      "Tu cuenta ha sido aprobada. Ya puedes recibir y aceptar servicios en StyleApp.",
            sound:     "default",
            priority:  "high",
            channelId: "styleapp-urgent",
          }]),
        });
      }

      return res.json({ ok: true, message: `Cuenta de ${prof.name} aprobada exitosamente.` });

    } else {
      await pool.query(
        `UPDATE users
         SET is_active=false, registration_status='rejected',
             registration_rejection_reason=$1, registration_reviewed_at=NOW()
         WHERE id=$2`,
        [reason, professional_id]
      );

      // Notificar al profesional
      if (prof.push_token) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{
            to:        prof.push_token,
            title:     "❌ Registro rechazado",
            body:      `Tu registro fue rechazado. Motivo: ${reason}`,
            sound:     "default",
            priority:  "high",
            channelId: "styleapp-urgent",
          }]),
        });
      }

      return res.json({ ok: true, message: `Registro de ${prof.name} rechazado.` });
    }
  } catch (err) {
    console.error("REVIEW PROFESSIONAL ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── Listar profesionales pendientes de revisión (solo admin) ──────────────
exports.getPendingProfessionals = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Solo administradores" });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, phone, document_type, document_number,
              id_front, id_back, diploma, antecedentes_doc, profile_photo,
              created_at, registration_status
       FROM users
       WHERE role IN ('barber','estilista','quiropodologo')
         AND registration_status = 'pending'
       ORDER BY created_at ASC`
    );

    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
