const express = require('express');
const app = express();
const port = 3000;

// Middleware para parsear JSON
app.use(express.json());

// Middleware de autenticación simple
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.replace('Bearer ', '');
  const TOKEN_ESPERADO = '37zwYUO5RZKP0oENZbcCRU79VVV_6BvunzVMnbzpQXaj3aKmZ';

  if (token !== TOKEN_ESPERADO) return res.status(403).json({ error: 'Token inválido' });

  req.user = { id: 1, name: 'John Lopez', email: 'john@example.com' };
  next();
}

// Ruta de prueba
app.get('/test/me', authMiddleware, (req, res) => {
  res.json({
    message: 'Ruta /test/me funcionando correctamente',
    user: req.user
  });
});

// Ruta para listar todas las rutas disponibles
app.get('/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(m => {
    if (m.route && m.route.path) {
      routes.push(Object.keys(m.route.methods).map(method => method.toUpperCase() + ' ' + m.route.path));
    }
  });
  res.json({ routes: routes.flat() });
});

// Levantar servidor
app.listen(port, () => console.log(`Servidor de prueba escuchando en http://localhost:${port}`));