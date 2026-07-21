// routes/pasajeros.js — Endpoints para pasajeros, usando store en memoria

const express = require('express');
const router  = express.Router();
const store   = require('../store');
const { validarCoordenadas } = require('../middleware/validar');


// POST /api/pasajeros/anunciarse
router.post('/anunciarse', validarCoordenadas, (req, res) => {
  const { ruta_id, lat, lng } = req.body;

  if (!ruta_id) return res.status(400).json({ error: 'ruta_id es requerido' });

  const ruta = store.buscarRuta(parseInt(ruta_id));
  if (!ruta)                   return res.status(404).json({ error: 'Ruta no encontrada' });
  if (ruta.estado === 'en_camino')  return res.status(409).json({ error: 'Este micro ya salió' });
  if (ruta.estado === 'finalizada') return res.status(409).json({ error: 'Esta ruta ya finalizó' });

  const pasajero = store.anunciarPasajero(parseInt(ruta_id), lat, lng);
  const total    = store.contarTotalPasajeros(parseInt(ruta_id));

  res.status(201).json({
    mensaje: '¡Te anunciaste! El chofer puede verte en el mapa.',
    pasajero_id: pasajero.id,
    total_pasajeros_en_ruta: total,
  });
});

// GET /api/pasajeros/ruta/:id
router.get('/ruta/:id', (req, res) => {
  const rutaId   = parseInt(req.params.id);
  const pasajeros = store.obtenerPasajerosDeLaRuta(rutaId);
  res.json({ total: pasajeros.length, pasajeros });
});

module.exports = router;
