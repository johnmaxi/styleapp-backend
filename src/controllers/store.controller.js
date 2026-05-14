// src/controllers/store.controller.js
const pool = require("../db/db");

// ── PRODUCTOS PÚBLICOS ────────────────────────────────────────────────────

exports.getProducts = async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `SELECT * FROM products WHERE is_active = true`;
    const params = [];
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }
    query += ` ORDER BY category, name`;
    const result = await pool.query(query, params);
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error("getProducts error:", err);
    return res.status(500).json({ ok: false, error: "Error obteniendo productos" });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

// ── ADMIN — CRUD PRODUCTOS ────────────────────────────────────────────────

exports.adminGetProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products ORDER BY created_at DESC`
    );
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

exports.adminCreateProduct = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });
    const { name, description, price, stock, category, image_url, is_active } = req.body;
    if (!name || !price)
      return res.status(400).json({ ok: false, error: "Nombre y precio son obligatorios" });
    const result = await pool.query(
      `INSERT INTO products (name, description, price, stock, category, image_url, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, description || null, price, stock || 0,
       category || null, image_url || null, is_active !== false]
    );
    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    console.error("adminCreateProduct error:", err);
    return res.status(500).json({ ok: false, error: "Error creando producto" });
  }
};

exports.adminUpdateProduct = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });
    const { id } = req.params;
    const { name, description, price, stock, category, image_url, is_active } = req.body;
    const result = await pool.query(
      `UPDATE products SET
         name=$1, description=$2, price=$3, stock=$4,
         category=$5, image_url=$6, is_active=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, description || null, price, stock || 0,
       category || null, image_url || null, is_active !== false, id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error actualizando producto" });
  }
};

exports.adminDeleteProduct = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });
    await pool.query(
      `UPDATE products SET is_active=false, updated_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    return res.json({ ok: true, message: "Producto desactivado" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

// ── PEDIDOS ───────────────────────────────────────────────────────────────

exports.createOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.user)
      return res.status(401).json({ ok: false, error: "No autenticado" });
    const { items, payment_method, address, phone, notes, mp_reference } = req.body;
    if (!items?.length)
      return res.status(400).json({ ok: false, error: "El carrito está vacío" });
    if (!payment_method || !address)
      return res.status(400).json({ ok: false, error: "Faltan datos del pedido" });

    await client.query("BEGIN");

    // Verificar stock y calcular total
    let total = 0;
    const validatedItems = [];
    for (const item of items) {
      const prodRes = await client.query(
        `SELECT * FROM products WHERE id=$1 AND is_active=true FOR UPDATE`,
        [item.product_id]
      );
      if (prodRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: `Producto #${item.product_id} no disponible` });
      }
      const prod = prodRes.rows[0];
      if (prod.stock < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          error: `Stock insuficiente para "${prod.name}". Disponible: ${prod.stock}`
        });
      }
      const subtotal = Number(prod.price) * item.quantity;
      total += subtotal;
      validatedItems.push({ ...item, unit_price: prod.price, subtotal, name: prod.name });
    }

    // Crear orden
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, total, payment_method, payment_status, address, phone, notes, mp_reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, total, payment_method,
       payment_method === "mercadopago" ? "paid" : "pending",
       address, phone || null, notes || null, mp_reference || null]
    );
    const order = orderRes.rows[0];

    // Insertar items y descontar stock
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.product_id, item.quantity, item.unit_price, item.subtotal]
      );
      await client.query(
        `UPDATE products SET stock = stock - $1, updated_at=NOW() WHERE id=$2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      data: { ...order, items: validatedItems },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("createOrder error:", err);
    return res.status(500).json({ ok: false, error: "Error procesando el pedido" });
  } finally {
    client.release();
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    if (!req.user)
      return res.status(401).json({ ok: false, error: "No autenticado" });
    const orders = await pool.query(
      `SELECT o.*,
         json_agg(json_build_object(
           'id', oi.id, 'product_id', oi.product_id,
           'quantity', oi.quantity, 'unit_price', oi.unit_price,
           'subtotal', oi.subtotal, 'product_name', p.name
         )) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    return res.json({ ok: true, data: orders.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

exports.adminGetOrders = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });
    const orders = await pool.query(
      `SELECT o.*, u.name as user_name, u.phone as user_phone,
         json_agg(json_build_object(
           'product_id', oi.product_id, 'quantity', oi.quantity,
           'unit_price', oi.unit_price, 'subtotal', oi.subtotal,
           'product_name', p.name
         )) as items
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       GROUP BY o.id, u.name, u.phone
       ORDER BY o.created_at DESC LIMIT 100`
    );
    return res.json({ ok: true, data: orders.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};

exports.adminUpdateOrderStatus = async (req, res) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "Solo admin" });
    const { status } = req.body;
    const VALID = ["pending","confirmed","shipped","delivered","cancelled"];
    if (!VALID.includes(status))
      return res.status(400).json({ ok: false, error: "Estado inválido" });
    const result = await pool.query(
      `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ ok: false, error: "Pedido no encontrado" });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Error" });
  }
};
