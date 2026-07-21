// store.js — Base de datos en memoria
//
// En vez de PostgreSQL, usamos un objeto JavaScript simple.
// Mientras el servidor esté corriendo, los datos persisten.
// Al reiniciar el servidor, todo se limpia — perfecto para una demo.
//
// Estructura:
//   choferes: [ { id, nombre, telefono } ]
//   rutas:    [ { id, chofer, origen, destino, estado, lat, lng, creadaEn } ]
//   pasajeros:[ { id, rutaId, lat, lng } ]

let seq = 1; // Contador global para generar IDs únicos

const store = {
  rutas: [],
  pasajeros: [],
};

// ── Helpers de ID ──────────────────────────────────────────
const nuevoId = () => seq++;

// ── RUTAS ──────────────────────────────────────────────────

const crearRuta = (nombre, telefono, origen, inicial = 0) => {
  const ruta = {
    id:       nuevoId(),
    chofer:   { nombre, telefono },              // sin tabla separada — no vale la pena para la demo
    origen,
    destino:  origen === 'montero' ? 'santa_cruz' : 'montero',
    estado:   'esperando',                       // 'esperando' | 'en_camino' | 'finalizada'
    lat:      null,
    lng:      null,
    inicial_pasajeros: inicial || 0,
    creadaEn: new Date().toISOString(),
  };
  store.rutas.push(ruta);
  return ruta;
};

const obtenerRutasActivas = () =>
  store.rutas.filter(r => r.estado === 'esperando' || r.estado === 'en_camino')
    .map(r => {
      const anunciados = store.pasajeros.filter(p => p.rutaId === r.id).length;
      const total = (r.inicial_pasajeros || 0) + anunciados;
      return {
        ...r,
        total_pasajeros: total,
      };
    });

const buscarRuta = (id) => store.rutas.find(r => r.id === id);

const existeRutaActiva = (origen) =>
  store.rutas.some(r => r.origen === origen && (r.estado === 'esperando' || r.estado === 'en_camino'));

const cambiarEstadoRuta = (id, nuevoEstado) => {
  const ruta = buscarRuta(id);
  if (!ruta) return null;
  ruta.estado = nuevoEstado;
  return ruta;
};

const actualizarPosicion = (id, lat, lng) => {
  const ruta = buscarRuta(id);
  if (!ruta) return null;
  ruta.lat = lat;
  ruta.lng = lng;
  return ruta;
};

// ── PASAJEROS ──────────────────────────────────────────────

const anunciarPasajero = (rutaId, lat, lng) => {
  const pasajero = { id: nuevoId(), rutaId, lat, lng };
  store.pasajeros.push(pasajero);
  return pasajero;
};

const contarPasajeros = (rutaId) =>
  store.pasajeros.filter(p => p.rutaId === rutaId).length;

const contarTotalPasajeros = (rutaId) => {
  const ruta = buscarRuta(rutaId);
  if (!ruta) return 0;
  return (ruta.inicial_pasajeros || 0) + contarPasajeros(rutaId);
};

const obtenerPasajerosDeLaRuta = (rutaId) =>
  store.pasajeros.filter(p => p.rutaId === rutaId);

module.exports = {
  crearRuta,
  obtenerRutasActivas,
  buscarRuta,
  existeRutaActiva,
  cambiarEstadoRuta,
  actualizarPosicion,
  anunciarPasajero,
  contarPasajeros,
  contarTotalPasajeros,
  obtenerPasajerosDeLaRuta,
};
