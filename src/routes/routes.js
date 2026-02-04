const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const authMiddleware = require('../middleware/auth.middleware');
const pool = require('../db/db');

// 🔐 AUTH
router.use('/auth', authRoutes);

// 🔒 RUTA PROTEGIDA DE PRUEBA
router.get('/usuarios', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

module.exports = router;