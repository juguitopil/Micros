// routes/rutas.js — Endpoints de rutas, ahora usando el store en memoria

const express = require('express');
const router  = express.Router();
const store   = require('../store');
const { validarIniciarRuta, validarCoordenadas } = require('../middleware/validar');
const { MINIMO_PASAJEROS_MONTERO, MINIMO_PASAJEROS_SANTA_CRUZ } = require('../../config/reglas');


// GET /api/rutas/activas
router.get('/activas', (req, res) => {
  res.json({ rutas: store.obtenerRutasActivas() });
});

// POST /api/rutas/iniciar — el chofer crea la ruta
router.post('/iniciar', validarIniciarRuta, (req, res) => {
  const { nombre, telefono, origen } = req.body;

  if (store.existeRutaActiva(origen)) {
    return res.status(409).json({
      error: `Ya hay un micro activo saliendo desde ${origen}. Solo se permite uno por dirección.`
    });
  }

  const ruta = store.crearRuta(nombre, telefono, origen);
  res.status(201).json({ mensaje: 'Ruta iniciada', ruta: { ...ruta, totalPasajeros: 0 } });
});

// POST /api/rutas/:id/salir — valida mínimo y sale
router.post('/:id/salir', (req, res) => {
  const rutaId = parseInt(req.params.id);
  const ruta   = store.buscarRuta(rutaId);

  if (!ruta || ruta.estado === 'finalizada') {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }

  const total   = store.contarPasajeros(rutaId);
  const minimo  = ruta.origen === 'montero' ? MINIMO_PASAJEROS_MONTERO : MINIMO_PASAJEROS_SANTA_CRUZ;

  if (total < minimo) {
    return res.status(422).json({
      error: 'Pasajeros insuficientes para salir',
      pasajeros_actuales:  total,
      pasajeros_requeridos: minimo,
      faltan: minimo - total,
    });
  }

  const rutaActualizada = store.cambiarEstadoRuta(rutaId, 'en_camino');
  res.json({ mensaje: '¡El micro salió!', ruta: rutaActualizada });
});

// PATCH /api/rutas/:id/posicion — GPS del chofer
router.patch('/:id/posicion', validarCoordenadas, (req, res) => {
  const rutaId = parseInt(req.params.id);
  const { lat, lng } = req.body;
  const resultado = store.actualizarPosicion(rutaId, lat, lng);

  if (!resultado) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.json({ actualizado: true, lat, lng });
});

// POST /api/rutas/:id/finalizar
router.post('/:id/finalizar', (req, res) => {
  const rutaId = parseInt(req.params.id);
  const ruta   = store.cambiarEstadoRuta(rutaId, 'finalizada');

  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.json({ mensaje: 'Ruta finalizada', ruta });
});

module.exports = router;
