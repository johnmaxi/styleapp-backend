const pool = require("../db/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function createToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

exports.register = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        ok: false,
        error: "name, email, password y role son requeridos",
      });
    }

    if (!["client", "barber"].includes(role)) {
      return res.status(400).json({
        ok: false,
        error: "role debe ser client o barber",
      });
    }

    const exists = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (exists.rowCount > 0) {
      return res.status(409).json({
        ok: false,
        error: "El email ya está registrado",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, phone`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, role, phone || null]
    );

    const user = result.rows[0];
    const token = createToken(user);

    return res.status(201).json({
      ok: true,
      token,
      user,
    });
  } catch (error) {
    console.error("🔥 REGISTER ERROR:", error);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "email y password son requeridos",
      });
    }

    const result = await pool.query(
      "SELECT id, name, email, password, role, phone FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ ok: false, error: "Credenciales inválidas" });
    }

    const token = createToken(user);


    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("🔥 LOGIN ERROR:", error);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
};