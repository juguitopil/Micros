// queries.js — Todas las consultas SQL en un solo lugar
//
// En vez de escribir SQL suelto en cada ruta de Express,
// lo centralizamos aquí. Ventajas:
//   1. Si cambia la estructura de la DB, editás UN solo archivo
//   2. Es fácil de testear cada función por separado
//   3. Queda claro qué hace cada consulta (separación de responsabilidades)

const pool = require('./pool');

// ─────────────────────────────────────────────
// QUERIES DE CHOFERES
// ─────────────────────────────────────────────

/**
 * Crea un nuevo chofer en la base de datos.
 * Usamos "parámetros preparados" ($1, $2) — NUNCA interpolación directa de strings.
 * Esto previene inyección SQL, el ataque más común en apps web.
 * @returns {Object} El chofer recién creado con su id asignado por Postgres
 */
const crearChofer = async (nombre, telefono) => {
  const result = await pool.query(
    'INSERT INTO choferes (nombre, telefono) VALUES ($1, $2) RETURNING *',
    [nombre, telefono]
  );
  return result.rows[0]; // RETURNING * nos devuelve la fila completa, incluido el id generado
};

/**
 * Busca un chofer por nombre y teléfono.
 * Lo usamos para evitar duplicados: si el chofer ya existe, no lo creamos de nuevo.
 */
const buscarChofer = async (nombre, telefono) => {
  const result = await pool.query(
    'SELECT * FROM choferes WHERE nombre = $1 AND telefono = $2',
    [nombre, telefono]
  );
  return result.rows[0]; // undefined si no existe
};

// ─────────────────────────────────────────────
// QUERIES DE RUTAS
// ─────────────────────────────────────────────

/**
 * Obtiene todas las rutas que están activas ahora mismo.
 * "Activa" = estado 'esperando' o 'en_camino' (no 'finalizada').
 * El JOIN nos trae el nombre del chofer junto con la ruta — una sola consulta.
 */
const obtenerRutasActivas = async () => {
  const result = await pool.query(`
    SELECT 
      r.id,
      r.origen,
      r.destino,
      r.estado,
      r.lat_actual,
      r.lng_actual,
      r.iniciada_en,
      c.nombre  AS chofer_nombre,
      c.telefono AS chofer_telefono,
      -- Subconsulta: cuántos pasajeros anunciados tiene esta ruta
      -- Hacerlo aquí evita un segundo request desde el backend
      (SELECT COUNT(*) FROM pasajeros_anunciados WHERE ruta_id = r.id) AS total_pasajeros
    FROM rutas r
    JOIN choferes c ON r.chofer_id = c.id
    WHERE r.estado IN ('esperando', 'en_camino')
    ORDER BY r.iniciada_en DESC
  `);
  return result.rows;
};

/**
 * Crea una nueva ruta (cuando el chofer toca "Iniciar ruta").
 * El origen y destino los inferimos: si viene de 'montero', va a 'santa_cruz' y viceversa.
 */
const crearRuta = async (choferId, origen) => {
  // Inferir destino automáticamente según el origen
  const destino = origen === 'montero' ? 'santa_cruz' : 'montero';

  const result = await pool.query(
    `INSERT INTO rutas (chofer_id, origen, destino, estado)
     VALUES ($1, $2, $3, 'esperando')
     RETURNING *`,
    [choferId, origen, destino]
  );
  return result.rows[0];
};

/**
 * Actualiza la posición GPS del micro.
 * Esta función se llama muy seguido (cada ~5 segundos desde el celular del chofer).
 * Por eso es importante que sea una query simple y rápida.
 */
const actualizarPosicion = async (rutaId, lat, lng) => {
  const result = await pool.query(
    `UPDATE rutas 
     SET lat_actual = $1, lng_actual = $2 
     WHERE id = $3 AND estado = 'en_camino'
     RETURNING id, lat_actual, lng_actual`,
    [lat, lng, rutaId]
  );
  return result.rows[0]; // null si la ruta no existe o no está en_camino
};

/**
 * Cambia el estado de la ruta a 'en_camino'.
 * Solo se puede hacer si hay suficientes pasajeros (validación en el controlador).
 */
const iniciarRecorrido = async (rutaId) => {
  const result = await pool.query(
    `UPDATE rutas 
     SET estado = 'en_camino' 
     WHERE id = $1 AND estado = 'esperando'
     RETURNING *`,
    [rutaId]
  );
  return result.rows[0];
};

/**
 * Finaliza una ruta (cuando el chofer toca "Terminar ruta").
 * Guardamos la hora exacta de finalización para historial.
 */
const finalizarRuta = async (rutaId) => {
  const result = await pool.query(
    `UPDATE rutas 
     SET estado = 'finalizada', finalizada_en = NOW() 
     WHERE id = $1 AND estado IN ('esperando', 'en_camino')
     RETURNING *`,
    [rutaId]
  );
  return result.rows[0];
};

/**
 * Verifica si ya hay una ruta activa para un origen dado.
 * Regla de negocio: máximo 1 ruta activa por dirección.
 */
const existeRutaActiva = async (origen) => {
  const result = await pool.query(
    `SELECT id FROM rutas 
     WHERE origen = $1 AND estado IN ('esperando', 'en_camino')
     LIMIT 1`,
    [origen]
  );
  return result.rows.length > 0; // true si ya existe una, false si no
};

// ─────────────────────────────────────────────
// QUERIES DE PASAJEROS
// ─────────────────────────────────────────────

/**
 * Registra a un pasajero que se anuncia en un punto del recorrido.
 * Solo necesitamos su ubicación GPS — sin nombre, sin cuenta.
 */
const anunciarPasajero = async (rutaId, lat, lng) => {
  const result = await pool.query(
    `INSERT INTO pasajeros_anunciados (ruta_id, lat, lng)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [rutaId, lat, lng]
  );
  return result.rows[0];
};

/**
 * Cuenta cuántos pasajeros están anunciados para una ruta.
 * Esta es LA consulta que determina si el micro puede salir.
 * COUNT(*) en Postgres es eficiente, especialmente con el índice que creamos.
 */
const contarPasajeros = async (rutaId) => {
  const result = await pool.query(
    'SELECT COUNT(*)::INTEGER AS total FROM pasajeros_anunciados WHERE ruta_id = $1',
    [rutaId]
  );
  // ::INTEGER convierte el COUNT (que Postgres devuelve como string) a número
  return result.rows[0].total;
};

/**
 * Obtiene todos los pasajeros anunciados de una ruta con sus coordenadas.
 * El chofer los ve en el mapa para saber dónde parar.
 */
const obtenerPasajerosDeLaRuta = async (rutaId) => {
  const result = await pool.query(
    'SELECT id, lat, lng, anunciado_en FROM pasajeros_anunciados WHERE ruta_id = $1 ORDER BY anunciado_en ASC',
    [rutaId]
  );
  return result.rows;
};

module.exports = {
  // Choferes
  crearChofer,
  buscarChofer,
  // Rutas
  obtenerRutasActivas,
  crearRuta,
  actualizarPosicion,
  iniciarRecorrido,
  finalizarRuta,
  existeRutaActiva,
  // Pasajeros
  anunciarPasajero,
  contarPasajeros,
  obtenerPasajerosDeLaRuta,
};
