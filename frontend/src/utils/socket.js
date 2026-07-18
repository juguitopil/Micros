// socket.js — Manejo de la conexión WebSocket desde el frontend
//
// Socket.io tiene una librería de cliente que se carga via CDN en el HTML.
// Este archivo la envuelve para que sea fácil de usar desde cualquier página.
//
// Patrón "Singleton": creamos UNA SOLA conexión compartida por toda la app.
// Si abriéramos una conexión nueva en cada componente, consumiríamos recursos
// innecesariamente y recibiríamos eventos duplicados.

const BACKEND_URL = window.ENV_BACKEND_URL || 'http://localhost:3001';

// La conexión compartida — se inicializa la primera vez que alguien la pida
let socketInstancia = null;

/**
 * Obtiene la conexión Socket.io (o la crea si no existe).
 * io() viene de la librería cliente cargada en el HTML:
 * <script src="https://cdn.socket.io/4.6.0/socket.io.min.js"></script>
 */
const obtenerSocket = () => {
  if (!socketInstancia) {
    // eslint-disable-next-line no-undef
    socketInstancia = io(BACKEND_URL, {
      // Intentar reconectar automáticamente si se cae la conexión
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000 // 1 segundo entre intentos
    });

    // Logs de debug — en producción podrías quitar estos
    socketInstancia.on('connect', () => {
      console.log('🔌 WebSocket conectado:', socketInstancia.id);
    });

    socketInstancia.on('disconnect', (motivo) => {
      console.log('🔌 WebSocket desconectado:', motivo);
    });

    socketInstancia.on('connect_error', (error) => {
      console.error('❌ Error de conexión WebSocket:', error.message);
    });
  }

  return socketInstancia;
};

/**
 * Se une a la sala de una ruta para recibir sus eventos en tiempo real.
 * Tanto pasajeros como choferes llaman a esto cuando entran a ver una ruta.
 * @param {number} rutaId
 */
const unirseARuta = (rutaId) => {
  const socket = obtenerSocket();
  socket.emit('unirse_a_ruta', rutaId);
};

/**
 * Escucha actualizaciones de posición del micro.
 * El pasajero llama a esto para mover el marcador del micro en el mapa.
 * @param {Function} callback - fn({ ruta_id, lat, lng, timestamp })
 */
const onPosicionActualizada = (callback) => {
  obtenerSocket().on('posicion_actualizada', callback);
};

/**
 * Escucha cuando se anuncia un nuevo pasajero.
 * El chofer llama a esto para ver los puntos de parada en su mapa.
 * @param {Function} callback - fn({ ruta_id, total_pasajeros, lat, lng })
 */
const onNuevoPasajero = (callback) => {
  obtenerSocket().on('nuevo_pasajero', callback);
};

/**
 * Escucha cuando el micro finalmente sale (cumplió el mínimo).
 * @param {Function} callback - fn({ ruta_id, mensaje, timestamp })
 */
const onRutaEnCamino = (callback) => {
  obtenerSocket().on('ruta_en_camino', callback);
};

/**
 * Escucha cuando el micro llega al destino.
 * @param {Function} callback - fn({ ruta_id, mensaje, timestamp })
 */
const onRutaFinalizada = (callback) => {
  obtenerSocket().on('ruta_finalizada', callback);
};

/**
 * Envía la posición GPS actual del chofer al servidor.
 * Se llama cada ~5 segundos con navigator.geolocation.watchPosition
 * @param {number} rutaId
 * @param {number} lat
 * @param {number} lng
 */
const emitirPosicion = (rutaId, lat, lng) => {
  obtenerSocket().emit('actualizar_posicion', { ruta_id: rutaId, lat, lng });
};

/**
 * Notifica al servidor que un pasajero se acaba de anunciar.
 * Se llama DESPUÉS de que el POST a /api/pasajeros/anunciarse tuvo éxito.
 * @param {number} rutaId
 * @param {number} lat
 * @param {number} lng
 */
const emitirNuevoPasajero = (rutaId, lat, lng) => {
  obtenerSocket().emit('pasajero_anunciado', { ruta_id: rutaId, lat, lng });
};

/**
 * Notifica que el micro salió.
 * El chofer lo llama después de que el POST /salir tuvo éxito.
 * @param {number} rutaId
 */
const emitirRutaSalio = (rutaId) => {
  obtenerSocket().emit('ruta_salio', { ruta_id: rutaId });
};

/**
 * Notifica que el micro finalizó el recorrido.
 * @param {number} rutaId
 */
const emitirRutaTerminada = (rutaId) => {
  obtenerSocket().emit('ruta_terminada', { ruta_id: rutaId });
};

/**
 * Limpia todos los listeners de un evento específico.
 * Importante llamarlo cuando el usuario navega fuera de la pantalla
 * para no acumular listeners duplicados.
 * @param {string} evento - nombre del evento a limpiar
 */
const limpiarListener = (evento) => {
  if (socketInstancia) {
    socketInstancia.off(evento);
  }
};

export {
  obtenerSocket,
  unirseARuta,
  onPosicionActualizada,
  onNuevoPasajero,
  onRutaEnCamino,
  onRutaFinalizada,
  emitirPosicion,
  emitirNuevoPasajero,
  emitirRutaSalio,
  emitirRutaTerminada,
  limpiarListener,
};
