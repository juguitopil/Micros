// sindicato.js — Lógica del panel del sindicato / chofer
//
// Esta pantalla tiene dos responsabilidades:
//   1. Permitir al chofer INICIAR una ruta (nombre, teléfono, origen)
//   2. Durante el recorrido: mostrar pasajeros, validar salida, terminar ruta
//
// El flujo es lineal:
//   [Formulario iniciar] → [Panel de espera con contador] → [En camino] → [Finalizar]

import { rutasApi } from '../utils/api.js';
import {
  unirseARuta,
  onNuevoPasajero,
  emitirPosicion,
  emitirRutaSalio,
  emitirRutaTerminada,
  limpiarListener,
} from '../utils/socket.js';
import { MINIMO_PASAJEROS_MONTERO, MINIMO_PASAJEROS_SANTA_CRUZ } from '/frontend/src/config/reglas.js';
// Nota: en el frontend las reglas de negocio se importan solo para MOSTRAR información
// (ej: "faltan 3 pasajeros para salir"). La VALIDACIÓN real siempre ocurre en el backend.
// Nunca confiés en validaciones solo del lado cliente — se pueden bypassear fácilmente.

// ─────────────────────────────────────────────────────────────
// ESTADO DEL PANEL
// ─────────────────────────────────────────────────────────────

const estado = {
  rutaActiva: null,         // La ruta que este chofer tiene activa ahora
  mapa: null,               // Mapa Leaflet
  watchId: null,            // ID del watchPosition del GPS (para poder cancelarlo)
  marcadoresPasajeros: [],  // Marcadores en el mapa de los puntos de espera
  intervaloPosicion: null,  // Backup de envío de posición por si el GPS falla
};

// ─────────────────────────────────────────────────────────────
// FORMULARIO: INICIAR RUTA
// ─────────────────────────────────────────────────────────────

/**
 * Maneja el submit del formulario "Iniciar ruta".
 * Se llama desde el onclick del botón en el HTML.
 */
window.iniciarRuta = async () => {
  const nombre   = document.getElementById('input-nombre').value.trim();
  const telefono = document.getElementById('input-telefono').value.trim();
  const origen   = document.getElementById('select-origen').value;

  // Validación básica en el cliente (el backend también valida, esto es solo UX)
  if (!nombre || !telefono || !origen) {
    mostrarError('Por favor completá todos los campos.');
    return;
  }

  // Deshabilitamos el botón para evitar doble-submit
  const btnIniciar = document.getElementById('btn-iniciar');
  btnIniciar.disabled = true;
  btnIniciar.textContent = 'Iniciando...';

  try {
    const respuesta = await rutasApi.iniciar(nombre, telefono, origen);
    estado.rutaActiva = respuesta.ruta;

    // Transición de pantalla: ocultamos el formulario y mostramos el panel activo
    document.getElementById('seccion-formulario').style.display = 'none';
    document.getElementById('seccion-ruta-activa').style.display = 'block';

    // Mostramos la info de la ruta recién creada
    actualizarInfoRuta(estado.rutaActiva);

    // Inicializamos el mapa en el panel activo
    inicializarMapaChofer();

    // Nos suscribimos a los eventos de esta ruta via WebSocket
    unirseARuta(estado.rutaActiva.id);
    configurarListenersChofer(estado.rutaActiva.id);

    // Empezamos a rastrear el GPS del chofer
    iniciarRastreoGPS();

  } catch (error) {
    mostrarError(error.message);
    btnIniciar.disabled = false;
    btnIniciar.textContent = 'Iniciar ruta';
  }
};

// ─────────────────────────────────────────────────────────────
// PANEL ACTIVO: DURANTE LA ESPERA Y EL RECORRIDO
// ─────────────────────────────────────────────────────────────

/**
 * Actualiza el panel con la info actual de la ruta.
 */
const actualizarInfoRuta = (ruta) => {
  document.getElementById('info-origen-destino').textContent =
    `${ruta.origen.toUpperCase()} → ${ruta.destino.toUpperCase()}`;

  document.getElementById('info-estado').textContent = ruta.estado;

  const minimoRequerido = ruta.origen === 'montero'
    ? MINIMO_PASAJEROS_MONTERO
    : MINIMO_PASAJEROS_SANTA_CRUZ;

  document.getElementById('info-minimo').textContent = minimoRequerido;
  actualizarContadorPasajeros(ruta.total_pasajeros || 0);
};

/**
 * Actualiza el contador de pasajeros y el botón de salida.
 * El botón se habilita/deshabilita automáticamente según si se cumplió el mínimo.
 */
const actualizarContadorPasajeros = (total) => {
  if (!estado.rutaActiva) return;

  const minimoRequerido = estado.rutaActiva.origen === 'montero'
    ? MINIMO_PASAJEROS_MONTERO
    : MINIMO_PASAJEROS_SANTA_CRUZ;

  // Actualizar texto del contador
  document.getElementById('contador-pasajeros').textContent = total;

  // Mostrar cuántos faltan
  const faltan = Math.max(0, minimoRequerido - total);
  document.getElementById('texto-faltan').textContent =
    faltan === 0 ? '¡Listo para salir!' : `Faltan ${faltan} para poder salir`;

  // Habilitar/deshabilitar el botón de salida
  const btnSalir = document.getElementById('btn-salir');
  if (btnSalir) {
    btnSalir.disabled = total < minimoRequerido;
  }
};

// ─────────────────────────────────────────────────────────────
// ACCIONES DEL CHOFER: SALIR Y FINALIZAR
// ─────────────────────────────────────────────────────────────

/**
 * El chofer toca "Salir" — el backend valida el mínimo de pasajeros.
 */
window.salirConMicro = async () => {
  if (!estado.rutaActiva) return;

  const btnSalir = document.getElementById('btn-salir');
  btnSalir.disabled = true;
  btnSalir.textContent = 'Validando...';

  try {
    await rutasApi.salir(estado.rutaActiva.id);

    // Actualizar estado local
    estado.rutaActiva.estado = 'en_camino';

    // Actualizar UI
    document.getElementById('info-estado').textContent = 'en_camino';
    btnSalir.style.display = 'none'; // Ya no necesita este botón

    // Notificar a todos los pasajeros via WebSocket
    emitirRutaSalio(estado.rutaActiva.id);

    mostrarNotificacion('¡Saliste! Buen viaje.', 'success');

  } catch (error) {
    // El backend puede rechazar con "Pasajeros insuficientes" — mostramos el detalle
    mostrarError(error.message);
    btnSalir.disabled = false;
    btnSalir.textContent = 'Salir';
  }
};

/**
 * El chofer toca "Terminar ruta" al llegar al destino.
 */
window.terminarRuta = async () => {
  if (!estado.rutaActiva) return;

  const confirmar = window.confirm('¿Confirmás que llegaste al destino y querés terminar la ruta?');
  if (!confirmar) return;

  try {
    await rutasApi.finalizar(estado.rutaActiva.id);

    // Notificar a pasajeros via WebSocket
    emitirRutaTerminada(estado.rutaActiva.id);

    // Detener el rastreo GPS
    detenerRastreoGPS();

    // Volver al formulario inicial para poder crear una nueva ruta
    estado.rutaActiva = null;
    document.getElementById('seccion-ruta-activa').style.display = 'none';
    document.getElementById('seccion-formulario').style.display = 'block';

    // Limpiar listeners de socket
    limpiarListener('nuevo_pasajero');

    mostrarNotificacion('Ruta finalizada correctamente.', 'success');

  } catch (error) {
    mostrarError(error.message);
  }
};

// ─────────────────────────────────────────────────────────────
// GPS — RASTREO DE POSICIÓN DEL CHOFER
// ─────────────────────────────────────────────────────────────

/**
 * Inicia el rastreo de la posición GPS del chofer.
 * watchPosition llama al callback CADA VEZ que el GPS detecta movimiento.
 * Es más eficiente que un setInterval porque solo dispara cuando hay cambio real.
 */
const iniciarRastreoGPS = () => {
  if (!navigator.geolocation) {
    mostrarError('Tu dispositivo no soporta GPS. No se podrá rastrear la posición.');
    return;
  }

  estado.watchId = navigator.geolocation.watchPosition(
    // Callback de éxito: recibimos la posición
    (posicion) => {
      const { latitude: lat, longitude: lng } = posicion.coords;

      // Actualizar marcador del chofer en su propio mapa
      if (estado.mapa && estado.marcadorChofer) {
        estado.marcadorChofer.setLatLng([lat, lng]);
      }

      // Enviar al servidor (que lo guardará en DB y lo emitirá a los pasajeros)
      if (estado.rutaActiva && estado.rutaActiva.estado !== 'finalizada') {
        emitirPosicion(estado.rutaActiva.id, lat, lng);
      }
    },
    // Callback de error
    (error) => {
      const mensajes = {
        1: 'El usuario bloqueó el acceso al GPS.',
        2: 'No se pudo obtener la posición (sin señal).',
        3: 'Se agotó el tiempo para obtener el GPS.',
      };
      console.error('Error GPS:', mensajes[error.code] || 'Error desconocido');
    },
    // Opciones del rastreo
    {
      enableHighAccuracy: true, // Usa GPS real, no solo WiFi/torres
      maximumAge: 5000,         // Acepta posiciones de hasta 5 segundos de antigüedad
      timeout: 10000,           // Espera hasta 10 segundos por la posición
    }
  );
};

/**
 * Cancela el rastreo de GPS cuando la ruta termina.
 * Sin esto, el GPS sigue corriendo en segundo plano gastando batería.
 */
const detenerRastreoGPS = () => {
  if (estado.watchId !== null) {
    navigator.geolocation.clearWatch(estado.watchId);
    estado.watchId = null;
    console.log('GPS detenido.');
  }
};

// ─────────────────────────────────────────────────────────────
// MAPA DEL CHOFER
// ─────────────────────────────────────────────────────────────

const inicializarMapaChofer = () => {
  const CENTRO_TRAMO = [-17.4800, -63.2000];

  estado.mapa = L.map('mapa-chofer').setView(CENTRO_TRAMO, 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18,
  }).addTo(estado.mapa);

  // Marcador del chofer (posición inicial en el centro del tramo)
  estado.marcadorChofer = L.marker(CENTRO_TRAMO, {
    icon: L.divIcon({ html: '🚌', className: '', iconSize: [32, 32] })
  }).addTo(estado.mapa);
};

// ─────────────────────────────────────────────────────────────
// TIEMPO REAL — LISTENERS DEL CHOFER
// ─────────────────────────────────────────────────────────────

const configurarListenersChofer = (rutaId) => {
  // Cuando se anuncia un pasajero, el chofer lo ve en su mapa
  onNuevoPasajero((datos) => {
    if (datos.ruta_id !== rutaId) return;

    // Actualizar contador
    actualizarContadorPasajeros(datos.total_pasajeros);

    // Agregar marcador del pasajero en el mapa del chofer
    if (datos.lat && datos.lng && estado.mapa) {
      const marcador = L.marker([datos.lat, datos.lng], {
        icon: L.divIcon({ html: '👤', className: '', iconSize: [24, 24] })
      })
        .bindPopup('Pasajero esperando aquí')
        .addTo(estado.mapa);

      estado.marcadoresPasajeros.push(marcador);
    }
  });
};

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

const mostrarError = (mensaje) => mostrarNotificacion(mensaje, 'error');

const mostrarNotificacion = (mensaje, tipo = 'info') => {
  const el = document.getElementById('notificacion-sindicato');
  if (!el) return;
  el.textContent = mensaje;
  el.className = `notificacion notificacion-${tipo}`;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
};

// ─────────────────────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // El panel arranca en el formulario — el chofer debe iniciar la ruta primero
  document.getElementById('seccion-ruta-activa').style.display = 'none';
  document.getElementById('seccion-formulario').style.display = 'block';
});
