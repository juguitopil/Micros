-- schema.sql — Estructura de la base de datos
-- Ejecutá este archivo UNA SOLA VEZ para crear las tablas.
-- Comando: psql -U tu_usuario -d micros_db -f src/db/schema.sql

-- ============================================================
-- TABLA: choferes
-- Guarda los choferes registrados por el sindicato.
-- Son pocos (máximo 2 activos a la vez), pero los guardamos
-- para tener historial y no pedir nombre/tel en cada ruta.
-- ============================================================
CREATE TABLE IF NOT EXISTS choferes (
  id          SERIAL PRIMARY KEY,         -- ID autoincremental, Postgres lo genera solo
  nombre      VARCHAR(100) NOT NULL,      -- Nombre del chofer
  telefono    VARCHAR(20)  NOT NULL,      -- Teléfono de contacto
  creado_en   TIMESTAMP DEFAULT NOW()     -- Cuándo se registró
);

-- ============================================================
-- TABLA: rutas
-- Cada fila es UN recorrido de un micro en un momento dado.
-- Una ruta pasa por estos estados:
--   'esperando'  → el chofer la creó, está juntando pasajeros
--   'en_camino'  → salió (cumplió el mínimo de pasajeros)
--   'finalizada' → llegó al destino
-- ============================================================
CREATE TABLE IF NOT EXISTS rutas (
  id              SERIAL PRIMARY KEY,
  chofer_id       INTEGER REFERENCES choferes(id),  -- Quién maneja
  origen          VARCHAR(20) NOT NULL,              -- 'montero' o 'santa_cruz'
  destino         VARCHAR(20) NOT NULL,              -- El opuesto al origen
  estado          VARCHAR(20) DEFAULT 'esperando',   -- Estado actual de la ruta
  lat_actual      DECIMAL(10, 7),                    -- Latitud GPS del micro (se actualiza en tiempo real)
  lng_actual      DECIMAL(10, 7),                    -- Longitud GPS del micro
  iniciada_en     TIMESTAMP DEFAULT NOW(),           -- Cuándo el chofer tocó "iniciar ruta"
  finalizada_en   TIMESTAMP,                         -- Cuándo tocó "terminar ruta" (null si sigue activa)

  -- Regla de negocio: solo puede haber 1 ruta activa por dirección a la vez.
  -- 'montero→santa_cruz' puede tener 1 micro, 'santa_cruz→montero' puede tener otro.
  -- Esta restricción la validamos en código también, pero conviene tenerla aquí.
  CONSTRAINT estado_valido CHECK (estado IN ('esperando', 'en_camino', 'finalizada'))
);

-- ============================================================
-- TABLA: pasajeros_anunciados
-- Un pasajero se "anuncia" desde un punto del recorrido.
-- No crea cuenta — solo dice "estoy aquí, voy en este micro".
-- El chofer ve cuántos hay y en qué punto del camino esperan.
-- ============================================================
CREATE TABLE IF NOT EXISTS pasajeros_anunciados (
  id          SERIAL PRIMARY KEY,
  ruta_id     INTEGER REFERENCES rutas(id) ON DELETE CASCADE,  -- A qué ruta pertenece
  lat         DECIMAL(10, 7) NOT NULL,   -- Dónde está esperando el pasajero
  lng         DECIMAL(10, 7) NOT NULL,
  anunciado_en TIMESTAMP DEFAULT NOW()   -- Cuándo se anunció
  -- No guardamos nombre ni datos personales — privacidad y simplicidad
);

-- ============================================================
-- ÍNDICES: aceleran las consultas más frecuentes
-- Sin índices, Postgres escanea toda la tabla en cada búsqueda.
-- Con índices, va directo a las filas que necesita.
-- ============================================================

-- Buscamos rutas por estado constantemente (para mostrar las activas)
CREATE INDEX IF NOT EXISTS idx_rutas_estado ON rutas(estado);

-- Buscamos pasajeros por ruta para contar cuántos hay
CREATE INDEX IF NOT EXISTS idx_pasajeros_ruta ON pasajeros_anunciados(ruta_id);
