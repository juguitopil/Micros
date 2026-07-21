// socketHandler.js — Toda la lógica de tiempo real con Socket.io
//
// Socket.io implementa WebSockets: una conexión bidireccional persistente
// entre el servidor y el navegador del usuario.
// A diferencia de HTTP (el cliente pide, el servidor responde),
// con WebSockets el SERVIDOR puede mandar datos cuando quiera.
//
// Flujo de eventos en este sistema:
//
//   Chofer actualiza GPS → servidor emite 'posicion_actualizada' → todos los pasajeros ven el marcador moverse
//   Pasajero se anuncia → servidor emite 'nuevo_pasajero' → el chofer ve el punto en su mapa
//   Micro sale          → servidor emite 'ruta_en_camino' → pasajeros reciben aviso
//   Micro termina       → servidor emite 'ruta_finalizada' → pasajeros reciben aviso

const db = require('../db/queries');
const store = require('../store');

/**
 * Esta función recibe el objeto `io` de Socket.io
 * y registra todos los manejadores de eventos.
 * Se llama una sola vez desde index.js.
 */
const inicializarSocket = (io) => {

  // El evento 'connection' se dispara cada vez que un usuario abre la app en su navegador
  io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);

    // ─────────────────────────────────────────────────────
    // EVENTO: unirse_a_ruta
    // El cliente (pasajero o chofer) se "suscribe" a una ruta específica.
    // Usamos "rooms" (salas) de Socket.io:
    //   - Cada ruta tiene su propia sala (ej: "ruta_42")
    //   - Solo los que están en esa sala reciben los eventos de esa ruta
    //   - Esto evita que todos los usuarios reciban TODOS los eventos
    // ─────────────────────────────────────────────────────
    socket.on('unirse_a_ruta', (rutaId) => {
      const sala = `ruta_${rutaId}`;
      socket.join(sala); // El socket entra a la sala
      console.log(`👥 Socket ${socket.id} se unió a la sala: ${sala}`);

      // Confirmamos al cliente que está suscrito
      socket.emit('unido_a_ruta', { ruta_id: rutaId, sala });
    });

    // ─────────────────────────────────────────────────────
    // EVENTO: actualizar_posicion
    // El chofer envía su GPS desde el celular.
    // Este evento llega SOLO desde el chofer (no de pasajeros).
    // ─────────────────────────────────────────────────────
    socket.on('actualizar_posicion', async (datos) => {
      const { ruta_id, lat, lng } = datos;

      // Validación básica antes de tocar la DB
      if (!ruta_id || !lat || !lng) {
        socket.emit('error', { mensaje: 'Datos de posición incompletos' });
        return;
      }

      try {
        // Actualizamos en la base de datos
        await db.actualizarPosicion(ruta_id, lat, lng);

        // Emitimos a TODOS los que están en la sala de esta ruta
        // io.to(sala) = todos en la sala
        // socket.to(sala) = todos EXCEPTO el que mandó el evento
        io.to(`ruta_${ruta_id}`).emit('posicion_actualizada', {
          ruta_id,
          lat,
          lng,
          timestamp: new Date().toISOString() // Para que el cliente sepa qué tan fresca es la posición
        });

      } catch (error) {
        console.error('Error actualizando posición vía socket:', error.message);
        socket.emit('error', { mensaje: 'Error guardando posición' });
      }
    });

    // ─────────────────────────────────────────────────────
    // EVENTO: pasajero_anunciado
    // Cuando un pasajero se anuncia (guardado en DB vía REST API),
    // el frontend emite este evento para notificar a la sala.
    // El chofer lo ve aparecer en su mapa en tiempo real.
    // ─────────────────────────────────────────────────────
    socket.on('pasajero_anunciado', async (datos) => {
      const { ruta_id } = datos;

      try {
        // Intentamos usar la capa de DB si está disponible, si no usamos el store en memoria
        let total;
        try {
          if (db && db.contarPasajeros) {
            total = await db.contarPasajeros(ruta_id);
          } else {
            total = store.contarTotalPasajeros(ruta_id);
          }
        } catch (innerErr) {
          // Fallback al store en memoria
          total = store.contarTotalPasajeros(ruta_id);
        }

        // Notificamos a todos en la sala (incluyendo al chofer)
        io.to(`ruta_${ruta_id}`).emit('nuevo_pasajero', {
          ruta_id,
          total_pasajeros: total,
          lat: datos.lat,
          lng: datos.lng
        });

      } catch (error) {
        console.error('Error emitiendo nuevo pasajero:', error.message);
      }
    });

    // ─────────────────────────────────────────────────────
    // EVENTO: ruta_salio
    // El chofer tocó "Salir" y el backend validó el mínimo.
    // Notificamos a todos los pasajeros de esa ruta.
    // ─────────────────────────────────────────────────────
    socket.on('ruta_salio', (datos) => {
      const { ruta_id } = datos;

      io.to(`ruta_${ruta_id}`).emit('ruta_en_camino', {
        ruta_id,
        mensaje: '¡El micro salió! Está en camino.',
        timestamp: new Date().toISOString()
      });
    });

    // ─────────────────────────────────────────────────────
    // EVENTO: ruta_terminada
    // El chofer llegó al destino.
    // ─────────────────────────────────────────────────────
    socket.on('ruta_terminada', (datos) => {
      const { ruta_id } = datos;

      io.to(`ruta_${ruta_id}`).emit('ruta_finalizada', {
        ruta_id,
        mensaje: 'El micro llegó al destino. Esta ruta finalizó.',
        timestamp: new Date().toISOString()
      });
    });

    // ─────────────────────────────────────────────────────
    // EVENTO: disconnect
    // Se dispara automáticamente cuando el usuario cierra la app o pierde internet.
    // Socket.io lo limpia solo — no necesitamos hacer nada manual.
    // ─────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Cliente desconectado: ${socket.id}`);
      // Las salas se limpian automáticamente al desconectarse
    });
  });
};

module.exports = { inicializarSocket };
