// pool.js — Conexión a la base de datos PostgreSQL
//
// Usamos "pg" (node-postgres), la librería estándar para conectar Node.js con Postgres.
// En vez de abrir y cerrar una conexión por cada consulta (costoso), usamos un "pool":
// un grupo de conexiones que se reutilizan — exactamente lo que hacen los seniors.

const { Pool } = require('pg');
require('dotenv').config();

// Pool crea hasta 10 conexiones simultáneas por defecto.
// Si llegan 20 requests a la vez, 10 esperan en fila — sin romper la DB.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // En producción (Render con Postgres) la conexión es por SSL obligatoriamente.
  // rejectUnauthorized: false permite certificados self-signed de servicios gratuitos.
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// Verificamos al arrancar que la conexión funciona.
// Si falla aquí, el error aparece inmediatamente en los logs — fácil de debuggear.
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    return;
  }
  release(); // Devolvemos la conexión al pool inmediatamente
  console.log('✅ Conectado a PostgreSQL correctamente');
});

module.exports = pool;
