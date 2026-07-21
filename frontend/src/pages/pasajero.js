// pasajero.js — Lógica completa de la pantalla del pasajero
//
// Esta pantalla hace tres cosas:
//   1. Muestra los micros activos con su ocupación
//   2. Permite al pasajero anunciarse en un punto del mapa
//   3. Actualiza el mapa en tiempo real cuando el micro se mueve
//
// No usamos un framework (React/Vue) para mantenerlo liviano —
// JavaScript vanilla + Leaflet es suficiente para el MVP.

import { rutasApi, pasajerosApi } from '../utils/api.js';
import { ORIGEN_COORDS } from '/frontend/src/config/reglas.js';
import {
  unirseARuta,
  onPosicionActualizada,
  onNuevoPasajero,
  onConteoPasajerosActualizado,
  onRutaEnCamino,
  onRutaFinalizada,
  emitirNuevoPasajero,
  limpiarListener,
} from '../utils/socket.js';

// ─────────────────────────────────────────────────────────────
// ESTADO LOCAL DE LA PANTALLA
// Variables que cambian mientras el usuario interactúa
// ─────────────────────────────────────────────────────────────

const estado = {
  mapa: null,              // Instancia del mapa Leaflet
  marcadoresMicros: {},    // { [rutaId]: marcadorLeaflet } — los íconos de los micros en el mapa
  marcadoresPasajeros: {}, // { [rutaId]: [marcador1, marcador2...] }
  rutaSeleccionada: null,  // La ruta en la que el pasajero quiere subir
  posicionUsuario: null,   // { lat, lng } del pasajero (obtenida del GPS)
};

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN DEL MAPA
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa el mapa Leaflet centrado en el tramo Montero-Santa Cruz.
 * Leaflet es la librería de mapas open source más usada.
 * OpenStreetMap es el proveedor de tiles (imágenes del mapa) — 100% gratis.
 */
const inicializarMapa = () => {
  // Coordenadas aproximadas del centro del tramo Montero-Santa Cruz, Bolivia
  const CENTRO_TRAMO = [-17.4800, -63.2000];
  const ZOOM_INICIAL = 11;

  // L es el objeto global de Leaflet, cargado via CDN en el HTML
  estado.mapa = L.map('mapa-pasajero').setView(CENTRO_TRAMO, ZOOM_INICIAL);

  // Capa de tiles de OpenStreetMap — no requiere API key
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(estado.mapa);

  // Cuando el pasajero hace click en el mapa, marcamos su punto de espera
  estado.mapa.on('click', manejarClickMapa);
};

// ─────────────────────────────────────────────────────────────
// CARGAR Y MOSTRAR RUTAS ACTIVAS
// ─────────────────────────────────────────────────────────────

/**
 * Pide las rutas activas al backend y las muestra en el mapa y en la lista.
 */
const cargarRutasActivas = async () => {
  try {
    const { rutas } = await rutasApi.obtenerActivas();

    // Limpiamos la lista antes de renderizar
    const listaEl = document.getElementById('lista-rutas');
    listaEl.innerHTML = '';

    if (rutas.length === 0) {
      listaEl.innerHTML = '<p>No hay micros activos en este momento.</p>';
      return;
    }

    rutas.forEach(ruta => {
      // Agregar marcador del micro en el mapa (si tiene posición GPS)
      if (ruta.lat_actual && ruta.lng_actual) {
        agregarMarcadorMicro(ruta);
      }

      // Dibujar la trayectoria de la ruta
      const origenCoord = ORIGEN_COORDS[ruta.origen];
      const destinoCoord = ORIGEN_COORDS[ruta.destino];
      if (origenCoord && destinoCoord) {
        L.polyline([origenCoord, destinoCoord], { color: '#007bff', weight: 3, opacity: 0.6 }).addTo(estado.mapa);
      }

      // Agregar la ruta a la lista en el panel lateral
      renderizarTarjetaRuta(ruta, listaEl);

      // Suscribirse a los eventos en tiempo real de esta ruta
      unirseARuta(ruta.id);
      configurarListenersRuta(ruta.id);
    });

  } catch (error) {
    console.error('Error cargando rutas:', error.message);
    mostrarNotificacion('Error al cargar rutas. Verificá tu conexión.', 'error');
  }
};

/**
 * Agrega o actualiza el marcador del micro en el mapa.
 * Si ya existe el marcador (porque ya cargamos esta ruta), lo movemos.
 * Si no existe, lo creamos.
 */
const agregarMarcadorMicro = (ruta) => {
  const { id, lat_actual, lng_actual, origen, destino, estado: estadoRuta, total_pasajeros } = ruta;

  // Ícono personalizado para el micro — podés cambiar el emoji por una imagen PNG
  const iconoMicro = L.divIcon({
    html: `<div class="marcador-micro" title="${origen} → ${destino}">🚌</div>`,
    className: '', // Quitamos la clase default de Leaflet
    iconSize: [32, 32],
    iconAnchor: [16, 16], // Punto del ícono que se pina en las coordenadas
  });

  if (estado.marcadoresMicros[id]) {
    // El marcador ya existe — solo actualizamos la posición y el popup
    estado.marcadoresMicros[id].setLatLng([lat_actual, lng_actual]);
    estado.marcadoresMicros[id].setPopupContent(
      generarContenidoPopupMicro(ruta)
    );
  } else {
    // Primera vez que vemos este micro — creamos el marcador
    const marcador = L.marker([lat_actual, lng_actual], { icon: iconoMicro })
      .bindPopup(generarContenidoPopupMicro(ruta))
      .addTo(estado.mapa);

    estado.marcadoresMicros[id] = marcador;
  }
};

/**
 * Genera el HTML del popup que aparece al clickear el marcador del micro.
 */
const generarContenidoPopupMicro = (ruta) => {
  return `
    <div class="popup-micro">
      <strong>${ruta.origen} → ${ruta.destino}</strong><br>
      Chofer: ${ruta.chofer_nombre}<br>
      Pasajeros: ${ruta.total_pasajeros}<br>
      Estado: ${ruta.estado === 'esperando' ? '⏳ Juntando pasajeros' : '🚌 En camino'}
      ${ruta.estado === 'esperando'
        ? `<br><button onclick="window.seleccionarRuta(${ruta.id})">Anunciarme en esta ruta</button>`
        : ''
      }
    </div>
  `;
};

/**
 * Renderiza una tarjeta de ruta en el panel lateral.
 */
const renderizarTarjetaRuta = (ruta, contenedor) => {
  const tarjeta = document.createElement('div');
  tarjeta.id = `tarjeta-ruta-${ruta.id}`;
  tarjeta.className = 'tarjeta-ruta';
  tarjeta.innerHTML = `
    <h3>${ruta.origen.toUpperCase()} → ${ruta.destino.toUpperCase()}</h3>
    <p>Chofer: ${ruta.chofer_nombre} (${ruta.chofer_telefono})</p>
    <p>Pasajeros: <span id="contador-${ruta.id}">${ruta.total_pasajeros}</span></p>
    <p>Estado: <span id="estado-${ruta.id}">${ruta.estado}</span></p>
    ${ruta.estado === 'esperando'
      ? `<button onclick="window.seleccionarRuta(${ruta.id})">📍 Anunciarme aquí</button>`
      : '<span>🚌 Ya salió</span>'
    }
  `;
  contenedor.appendChild(tarjeta);
};

// ─────────────────────────────────────────────────────────────
// TIEMPO REAL — LISTENERS DE SOCKET
// ─────────────────────────────────────────────────────────────

/**
 * Configura todos los listeners de tiempo real para una ruta.
 * Se llama una vez por ruta cuando la cargamos.
 */
const configurarListenersRuta = (rutaId) => {
  // Cuando el micro se mueve, actualizamos su marcador en el mapa
  onPosicionActualizada((datos) => {
    if (datos.ruta_id !== rutaId) return; // Ignoramos eventos de otras rutas

    const marcador = estado.marcadoresMicros[rutaId];
    if (marcador) {
      marcador.setLatLng([datos.lat, datos.lng]);
    }
  });

  // Cuando se anuncia un nuevo pasajero, actualizamos el contador
  onNuevoPasajero((datos) => {
    if (datos.ruta_id !== rutaId) return;

    const contadorEl = document.getElementById(`contador-${rutaId}`);
    if (contadorEl) {
      contadorEl.textContent = datos.total_pasajeros;
    }

    // Marcamos visualmente el punto donde espera el pasajero
    if (datos.lat && datos.lng) {
      const iconoPasajero = L.divIcon({ html: '👤', className: '', iconSize: [24, 24] });
      const marcador = L.marker([datos.lat, datos.lng], { icon: iconoPasajero })
        .addTo(estado.mapa);

      // Guardamos los marcadores de pasajeros para poder limpiarlos después
      if (!estado.marcadoresPasajeros[rutaId]) {
        estado.marcadoresPasajeros[rutaId] = [];
      }
      estado.marcadoresPasajeros[rutaId].push(marcador);
    }
  });

  // Cuando el chofer actualiza el conteo manualmente, refrescamos el contador
  onConteoPasajerosActualizado((datos) => {
    if (datos.ruta_id !== rutaId) return;

    const contadorEl = document.getElementById(`contador-${rutaId}`);
    if (contadorEl) {
      contadorEl.textContent = datos.total_pasajeros;
    }
  });

  // Cuando el micro sale, actualizamos el estado en la UI
  onRutaEnCamino((datos) => {
    if (datos.ruta_id !== rutaId) return;

    const estadoEl = document.getElementById(`estado-${rutaId}`);
    if (estadoEl) estadoEl.textContent = 'en_camino';

    mostrarNotificacion(`¡El micro (ruta ${rutaId}) salió! Está en camino.`, 'success');
  });

  // Cuando el micro llega, limpiamos los marcadores de pasajeros
  onRutaFinalizada((datos) => {
    if (datos.ruta_id !== rutaId) return;

    // Eliminamos los marcadores de pasajeros del mapa
    if (estado.marcadoresPasajeros[rutaId]) {
      estado.marcadoresPasajeros[rutaId].forEach(m => estado.mapa.removeLayer(m));
    }

    // Eliminamos el marcador del micro
    if (estado.marcadoresMicros[rutaId]) {
      estado.mapa.removeLayer(estado.marcadoresMicros[rutaId]);
      delete estado.marcadoresMicros[rutaId];
    }

    // Eliminamos la tarjeta del panel
    const tarjeta = document.getElementById(`tarjeta-ruta-${rutaId}`);
    if (tarjeta) tarjeta.remove();

    mostrarNotificacion(`El micro (ruta ${rutaId}) llegó al destino.`, 'info');
  });
};

// ─────────────────────────────────────────────────────────────
// ANUNCIARSE COMO PASAJERO
// ─────────────────────────────────────────────────────────────

/**
 * El pasajero selecciona en qué ruta quiere subir.
 * Se expone como window.seleccionarRuta para que el onclick del HTML la pueda llamar.
 */
window.seleccionarRuta = (rutaId) => {
  estado.rutaSeleccionada = rutaId;
  mostrarNotificacion(
    '📍 Ahora hacé click en el mapa para marcar dónde estás esperando el micro.',
    'info'
  );
};

/**
 * Maneja el click en el mapa cuando el pasajero quiere marcar su posición.
 */
const manejarClickMapa = async (evento) => {
  if (!estado.rutaSeleccionada) {
    mostrarNotificacion('Primero seleccioná una ruta tocando "Anunciarme aquí".', 'warning');
    return;
  }

  const { lat, lng } = evento.latlng; // Leaflet nos da las coordenadas del click

  try {
    // 1. Guardamos en la base de datos vía REST API
    const respuesta = await pasajerosApi.anunciarse(estado.rutaSeleccionada, lat, lng);

    // 2. Notificamos al servidor vía WebSocket para que el chofer lo vea en tiempo real
    emitirNuevoPasajero(estado.rutaSeleccionada, lat, lng);

    mostrarNotificacion(
      `✅ ¡Listo! El chofer puede verte. Hay ${respuesta.total_pasajeros_en_ruta} personas en esta ruta.`,
      'success'
    );

    // Resetear la ruta seleccionada
    estado.rutaSeleccionada = null;

  } catch (error) {
    mostrarNotificacion(`Error al anunciarte: ${error.message}`, 'error');
  }
};

// ─────────────────────────────────────────────────────────────
// UTILIDADES DE UI
// ─────────────────────────────────────────────────────────────

/**
 * Muestra una notificación temporal en pantalla.
 * @param {string} mensaje
 * @param {'success'|'error'|'info'|'warning'} tipo
 */
const mostrarNotificacion = (mensaje, tipo = 'info') => {
  const notiEl = document.getElementById('notificacion');
  if (!notiEl) return;

  notiEl.textContent = mensaje;
  notiEl.className = `notificacion notificacion-${tipo}`;
  notiEl.style.display = 'block';

  // La notificación desaparece sola después de 4 segundos
  setTimeout(() => {
    notiEl.style.display = 'none';
  }, 4000);
};

// ─────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA — se llama cuando carga la página
// ─────────────────────────────────────────────────────────────

const inicializar = async () => {
  inicializarMapa();
  await cargarRutasActivas();

  // Refrescamos las rutas cada 30 segundos como respaldo al tiempo real
  // Si el WebSocket falla por alguna razón, el polling de backup mantiene los datos actualizados
  setInterval(cargarRutasActivas, 30000);
};

// Cuando el HTML termina de cargar, inicializamos todo
document.addEventListener('DOMContentLoaded', inicializar);
