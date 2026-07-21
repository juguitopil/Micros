// api.js — Todas las llamadas al backend en un solo archivo
//
// En vez de escribir fetch() suelto en cada componente, centralizamos las llamadas.
// Si cambia la URL del backend o querés agregar headers globales (como un token),
// lo hacés en UN lugar — no en 10 archivos distintos.

// La URL base del backend. En producción apunta al servidor en Render.
// process.env variables en el frontend se cargan con un bundler (Vite, Webpack, etc.)
// Para la demo sin bundler, reemplazá directamente con la URL de Render.
const BASE_URL = window.ENV_BACKEND_URL || 'http://localhost:3001';

/**
 * Función helper para hacer requests y manejar errores de forma consistente.
 * Evita repetir try/catch en cada llamada.
 */
const request = async (endpoint, opciones = {}) => {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...opciones.headers // Permite agregar headers extra si se necesitan
    },
    ...opciones
  });

  // Intentamos parsear siempre como JSON
  const datos = await response.json();

  // Si el servidor respondió con error (4xx, 5xx), lanzamos el mensaje de error
  if (!response.ok) {
    throw new Error(datos.error || `Error ${response.status}`);
  }

  return datos;
};

// ─────────────────────────────────────────────────────────────
// API DE RUTAS
// ─────────────────────────────────────────────────────────────

export const rutasApi = {
  /**
   * Obtiene todas las rutas activas para mostrar en el mapa del pasajero.
   */
  obtenerActivas: () => request('/api/rutas/activas'),

  /**
   * El chofer inicia una nueva ruta.
   * @param {string} nombre   - Nombre del chofer
   * @param {string} telefono - Teléfono del chofer
   * @param {string} origen   - 'montero' o 'santa_cruz'
   */
  iniciar: (nombre, telefono, origen, inicial = 0) =>
    request('/api/rutas/iniciar', {
      method: 'POST',
      body: JSON.stringify({ nombre, telefono, origen, inicial })
    }),

  /**
   * Intenta que el micro salga (valida el mínimo de pasajeros).
   * Si no hay suficientes, el backend devuelve error con el detalle.
   * @param {number} rutaId
   */
  salir: (rutaId) =>
    request(`/api/rutas/${rutaId}/salir`, { method: 'POST' }),

  /**
   * Actualiza la posición GPS del micro (llamado cada ~5 segundos).
   * @param {number} rutaId
   * @param {number} lat
   * @param {number} lng
   */
  actualizarPosicion: (rutaId, lat, lng) =>
    request(`/api/rutas/${rutaId}/posicion`, {
      method: 'PATCH',
      body: JSON.stringify({ lat, lng })
    }),

  /**
   * El chofer finaliza la ruta al llegar al destino.
   * @param {number} rutaId
   */
  finalizar: (rutaId) =>
    request(`/api/rutas/${rutaId}/finalizar`, { method: 'POST' }),
};

// ─────────────────────────────────────────────────────────────
// API DE PASAJEROS
// ─────────────────────────────────────────────────────────────

export const pasajerosApi = {
  /**
   * El pasajero se anuncia en un punto del recorrido.
   * @param {number} rutaId - A qué ruta se anuncia
   * @param {number} lat    - Latitud donde está esperando
   * @param {number} lng    - Longitud donde está esperando
   */
  anunciarse: (rutaId, lat, lng) =>
    request('/api/pasajeros/anunciarse', {
      method: 'POST',
      body: JSON.stringify({ ruta_id: rutaId, lat, lng })
    }),

  /**
   * Obtiene los pasajeros anunciados de una ruta (para el mapa del chofer).
   * @param {number} rutaId
   */
  obtenerDeRuta: (rutaId) => request(`/api/pasajeros/ruta/${rutaId}`),
};
