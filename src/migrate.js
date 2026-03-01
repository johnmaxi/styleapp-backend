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
    console.log('🚀 Iniciando migración v2...');

    // USUARIOS - actualizar constraint de roles
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
        city TEXT,
        neighborhood TEXT,
        payment_method TEXT,
        account_number TEXT,
        document_type TEXT,
        document_number TEXT,
        portfolio JSONB DEFAULT '[]'::jsonb,
        id_front TEXT,
        id_back TEXT,
        profile_photo TEXT,
        diploma TEXT,
        rating NUMERIC(3,2) DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        balance NUMERIC(10,2) DEFAULT 0
      );
    `);

    await client.query(`ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;`);
    await client.query(`
      ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role = ANY (ARRAY['client','barber','estilista','quiropodologo','admin']));
    `);

    // Agregar columnas nuevas si no existen
    const newUserCols = [
      ['city', 'TEXT'],
      ['neighborhood', 'TEXT'],
      ['profile_photo', 'TEXT'],
      ['diploma', 'TEXT'],
      ['rating', 'NUMERIC(3,2) DEFAULT 0'],
      ['rating_count', 'INTEGER DEFAULT 0'],
      ['balance', 'NUMERIC(10,2) DEFAULT 0'],
    ];
    for (const [col, type] of newUserCols) {
      await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ${col} ${type};`);
    }
    console.log('✅ Tabla users actualizada');

    // SERVICIOS
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        base_price NUMERIC(10,2),
        duration_minutes INTEGER
      );
    `);

    // SERVICE_REQUEST
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.service_request (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES public.users(id),
        service_type VARCHAR(500) NOT NULL,
        professional_type VARCHAR(50),
        address TEXT NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        status VARCHAR(20) DEFAULT 'open',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        services TEXT,
        price NUMERIC,
        assigned_barber_id INTEGER REFERENCES public.users(id)
      );
    `);
    await client.query(`ALTER TABLE public.service_request ADD COLUMN IF NOT EXISTS professional_type VARCHAR(50);`);
    await client.query(`ALTER TABLE public.service_request ADD COLUMN IF NOT EXISTS service_type VARCHAR(500);`);
    console.log('✅ Tabla service_request actualizada');

    // BIDS
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

    // JOBS
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

    // CALIFICACIONES
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.ratings (
        id SERIAL PRIMARY KEY,
        service_request_id INTEGER NOT NULL REFERENCES public.service_request(id) ON DELETE CASCADE,
        rater_id INTEGER NOT NULL REFERENCES public.users(id),
        rated_id INTEGER NOT NULL REFERENCES public.users(id),
        score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(service_request_id, rater_id)
      );
    `);
    console.log('✅ Tabla ratings creada');

    // ÍNDICES
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bids_srid_barber_status ON public.bids(service_request_id, barber_id, status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sr_assigned_barber ON public.service_request(assigned_barber_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sr_professional_type ON public.service_request(professional_type);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ratings_rated_id ON public.ratings(rated_id);`);
    console.log('✅ Índices creados');

    // DATOS SEMILLA
    await client.query(`
      INSERT INTO public.users (id, name, email, password, role, phone, created_at, portfolio)
      VALUES
        (2,'Pedro Barbero','barbero@test.com','$2b$10$xlLI8wcXHZhlHwAEM5..2O9IyQE9JObKOOWwT6yFgUihok7.MrUna','barber','3009876543','2026-01-09 21:10:20','[]'),
        (1,'Juan Cliente','cliente@test.com','$2b$10$BPNYnS64SQbh/o184FsITuWqKzrh2QRuWuqPo6V.QctC.B9HEiDRK','client','3001234567','2026-01-09 21:10:20','[]'),
        (8,'Administrador','admin@styleapp.com','$2b$10$2kIVI5nADlfdKUlS9qB/w.jj9RQgHiXcthl9cmAXP6uP2GxKvfe0a','admin',NULL,'2026-02-21 00:02:54','[]')
      ON CONFLICT (id) DO NOTHING;
    `);
    await client.query(`SELECT setval('public.users_id_seq', 11, true);`);

    await client.query(`
      INSERT INTO public.services (id, name, base_price, duration_minutes)
      VALUES (1,'Corte de cabello',20000.00,30)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('🎉 Migración v2 completada exitosamente');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
