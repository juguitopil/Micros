// validar.js — Middleware para validar datos que llegan al servidor
//
// Un "middleware" en Express es una función que se ejecuta ANTES del controlador.
// Si los datos son inválidos, corta la request aquí y devuelve un error — 
// el controlador nunca llega a ejecutarse con datos sucios.
// Esto es el patrón "fail fast": fallar lo antes posible, con un mensaje claro.

const { ORIGENES_VALIDOS } = require('../../config/reglas');

/**
 * Valida que el body de "iniciar ruta" tenga los campos requeridos.
 * Express llama a next() para pasar al siguiente middleware o al controlador.
 */
const validarIniciarRuta = (req, res, next) => {
  const { nombre, telefono, origen } = req.body;

  // Verificamos que todos los campos estén presentes y no vacíos
  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre del chofer es requerido' });
  }

  if (!telefono || telefono.trim() === '') {
    return res.status(400).json({ error: 'El teléfono del chofer es requerido' });
  }

  if (!origen) {
    return res.status(400).json({ error: 'El origen de la ruta es requerido' });
  }

  // Verificamos que el origen sea uno de los valores permitidos
  if (!ORIGENES_VALIDOS.includes(origen)) {
    return res.status(400).json({
      error: `Origen inválido. Debe ser uno de: ${ORIGENES_VALIDOS.join(', ')}`
    });
  }

  // Si todo está bien, limpiamos los strings y pasamos al controlador
  req.body.nombre   = nombre.trim();
  req.body.telefono = telefono.trim();
  next();
};

/**
 * Valida que las coordenadas GPS sean números válidos.
 * Usamos esta validación tanto para actualizar posición del chofer
 * como para que el pasajero anuncie su ubicación.
 */
const validarCoordenadas = (req, res, next) => {
  const { lat, lng } = req.body;

  if (lat === undefined || lat === null) {
    return res.status(400).json({ error: 'La latitud (lat) es requerida' });
  }

  if (lng === undefined || lng === null) {
    return res.status(400).json({ error: 'La longitud (lng) es requerida' });
  }

  // parseFloat convierte el string a número decimal
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  // isNaN = "is Not a Number" — detecta si la conversión falló
  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'Las coordenadas deben ser números' });
  }

  // Rango válido para Bolivia: lat entre -23 y -9, lng entre -70 y -57 aprox.
  // Rechazamos coordenadas que claramente están fuera del país.
  if (latNum < -23 || latNum > -9 || lngNum < -70 || lngNum > -57) {
    return res.status(400).json({ error: 'Coordenadas fuera del rango válido para Bolivia' });
  }

  // Reemplazamos los valores originales por los números parseados
  req.body.lat = latNum;
  req.body.lng = lngNum;
  next();
};

module.exports = { validarIniciarRuta, validarCoordenadas };
