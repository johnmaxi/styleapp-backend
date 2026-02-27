// src/migrate.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false }
});

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('🚀 Iniciando migración...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role VARCHAR(20) NOT NULL,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        gender TEXT,
        address TEXT,
        payment_method TEXT,
        account_number TEXT,
        account_type TEXT,
        document_type TEXT,
        document_number TEXT,
        portfolio JSONB DEFAULT '[]'::jsonb,
        id_front TEXT,
        id_back TEXT
      );
    `);
    console.log('✅ Tabla users verificada');

    // Actualizar constraint de role para incluir nuevos roles
    await client.query(`
      ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
    `);
    await client.query(`
      ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role = ANY (ARRAY['client','barber','estilista','quiropodologo','admin']));
    `);
    console.log('✅ Constraint de roles actualizado');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        base_price NUMERIC(10,2),
        duration_minutes INTEGER
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.service_request (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES public.users(id),
        service_type VARCHAR(200) NOT NULL,
        professional_type VARCHAR(50),
        address TEXT NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        status VARCHAR(20) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        services TEXT,
        price NUMERIC,
        assigned_barber_id INTEGER REFERENCES public.users(id)
      );
    `);
    console.log('✅ Tabla service_request verificada');

    // Agregar columna professional_type si no existe
    await client.query(`
      ALTER TABLE public.service_request
      ADD COLUMN IF NOT EXISTS professional_type VARCHAR(50);
    `);
    console.log('✅ Columna professional_type agregada');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.bids (
        id SERIAL PRIMARY KEY,
        service_request_id INTEGER NOT NULL REFERENCES public.service_request(id) ON DELETE CASCADE,
        barber_id INTEGER NOT NULL REFERENCES public.users(id),
        amount NUMERIC(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.jobs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES public.users(id),
        barber_id INTEGER REFERENCES public.users(id),
        service_id INTEGER NOT NULL REFERENCES public.services(id),
        description TEXT,
        client_offer NUMERIC(10,2),
        status VARCHAR(20) DEFAULT 'ongoing',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_bids_service_request_barber_status ON public.bids(service_request_id, barber_id, status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_request_assigned_barber_id ON public.service_request(assigned_barber_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_request_professional_type ON public.service_request(professional_type);`);
    console.log('✅ Índices creados');

    // Datos semilla
    await client.query(`
      INSERT INTO public.users (id, name, email, password, role, phone, created_at, portfolio)
      VALUES
        (2,'Pedro Barbero','barbero@test.com','$2b$10$xlLI8wcXHZhlHwAEM5..2O9IyQE9JObKOOWwT6yFgUihok7.MrUna','barber','3009876543','2026-01-09 21:10:20.446587','[]'),
        (1,'Juan Cliente','cliente@test.com','$2b$10$BPNYnS64SQbh/o184FsITuWqKzrh2QRuWuqPo6V.QctC.B9HEiDRK','client','3001234567','2026-01-09 21:10:20.446587','[]'),
        (8,'Administrador','admin@styleapp.com','$2b$10$2kIVI5nADlfdKUlS9qB/w.jj9RQgHiXcthl9cmAXP6uP2GxKvfe0a','admin',NULL,'2026-02-21 00:02:54.497846','[]'),
        (9,'Ana Maria Perea Ruiz','ana@test.com','$2b$10$sSpLOabZCTwJGw5/CqsH6epcoEv3W6HkiYR27EFlyO788nI5kXBoG','barber','3104508890','2026-02-22 17:13:30.832162','["1","2","3"]'),
        (10,'Sofia Andrea Henao Mena','sofia@test.com','$2b$10$/rH6QvNucsJdDkQqCsg4EOLZI0nMcZEsJGwQcO7jFdjJOdibmj7xS','client','3215006080','2026-02-22 17:54:14.622603','[]'),
        (11,'Raul Moreno','raul@test.com','$2b$10$x75R3PsE1T6wRhP0Sj8vgu/5lFyjA4Q6q/Yweut2A6lV.nWKbOm/K','client','3105008080','2026-02-26 09:59:19.233408','[]')
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`SELECT setval('public.users_id_seq', 11, true);`);

    await client.query(`
      INSERT INTO public.services (id, name, base_price, duration_minutes)
      VALUES (1,'Corte de cabello',20000.00,30)
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`SELECT setval('public.services_id_seq', 1, true);`);

    console.log('🎉 Migración completada exitosamente');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
