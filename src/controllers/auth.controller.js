// src/controllers/auth.controller.js
const pool = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const VALID_ROLES = ["client", "barber", "estilista", "quiropodologo", "admin"];

exports.register = async (req, res) => {
  try {
    const {
      name, email, password, phone,
      role = "client", gender,
      address, city, neighborhood,
      payment_method, account_number,
      document_type, document_number,
      portfolio = [],
      id_front, id_back,
      profile_photo, diploma,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: "Nombre, email y contraseña son obligatorios" });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ ok: false, error: `Rol inválido. Permitidos: ${VALID_ROLES.join(", ")}` });
    }

    const existing = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ ok: false, error: "El email ya está registrado" });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users
       (name, email, password, role, phone, gender,
        address, city, neighborhood,
        payment_method, account_number,
        document_type, document_number,
        portfolio, id_front, id_back,
        profile_photo, diploma)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id, name, email, role, phone, gender, address, city, neighborhood`,
      [
        name, email, hash, role,
        phone || null, gender || null,
        address || null, city || null, neighborhood || null,
        payment_method || null, account_number || null,
        document_type || null, document_number || null,
        JSON.stringify(portfolio || []),
        id_front || null, id_back || null,
        profile_photo || null, diploma || null,
      ]
    );

    return res.status(201).json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error("🔥 REGISTER ERROR:", error);
    return res.status(500).json({ ok: false, error: "Error registrando usuario" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña son requeridos" });
    }

    const result = await pool.query(
      `SELECT id, email, password, role, gender, name, profile_photo, rating
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        gender: user.gender,
        name: user.name,
        profile_photo: user.profile_photo,
        rating: user.rating,
      },
    });
  } catch (error) {
    console.error("🔥 LOGIN ERROR:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};
