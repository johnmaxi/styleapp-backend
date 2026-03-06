// src/controllers/auth.controller.js
const pool = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const VALID_ROLES = ["client", "barber", "estilista", "quiropodologo", "admin"];
const PROFESSIONAL_ROLES = ["barber", "estilista", "quiropodologo"];

exports.register = async (req, res) => {
  try {
    const {
      name, email, password, phone, role = "client", gender,
      address, city, neighborhood,
      payment_methods, payment_method, account_number,
      document_type, document_number, portfolio = [],
      cedula_doc, diploma_doc, id_front, id_back, diploma, profile_photo,
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

    const hash             = await bcrypt.hash(password, 10);
    const resolvedIdFront  = cedula_doc || id_front || null;
    const resolvedDiploma  = diploma_doc || diploma || null;
    const resolvedPayment  = Array.isArray(payment_methods)
      ? payment_methods.join(",")
      : payment_method || null;

    const result = await pool.query(
      `INSERT INTO users
       (name, email, password, role, phone, gender,
        address, city, neighborhood,
        payment_method, account_number,
        document_type, document_number,
        portfolio, id_front, id_back, profile_photo, diploma)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id, name, email, role, phone, gender,
                 address, city, neighborhood, profile_photo`,
      [
        name, email, hash, role, phone || null, gender || null,
        address || null, city || null, neighborhood || null,
        resolvedPayment, account_number || null,
        document_type || null, document_number || null,
        JSON.stringify(portfolio || []),
        resolvedIdFront, id_back || null, profile_photo || null, resolvedDiploma,
      ]
    );

    const newUser = result.rows[0];
    const isProfessional = PROFESSIONAL_ROLES.includes(role);

    return res.status(201).json({
      ok: true,
      user: newUser,
      message: isProfessional
        ? "Registro exitoso. Tu perfil y documentos estan en validacion. Recibiras una respuesta en las proximas 24 horas."
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

    // FIX: incluir address en el SELECT
    const result = await pool.query(
      `SELECT id, email, password, role, gender, name, profile_photo,
              rating, phone, address, city, neighborhood
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales invalidas" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Credenciales invalidas" });
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
        address:       user.address,       // FIX: incluir address
        city:          user.city,
        neighborhood:  user.neighborhood,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};
