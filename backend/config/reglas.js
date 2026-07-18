// reglas.js — Las reglas de negocio del sistema en un solo lugar
//
// ¿Por qué un archivo separado para esto?
// Si mañana el sindicato decide cambiar el mínimo de 15 a 12 pasajeros,
// solo cambiás UNA línea aquí — no buscás el número hardcodeado en 5 archivos.
// Esta práctica se llama "single source of truth" (única fuente de verdad).

module.exports = {
  // Mínimo de pasajeros para que el micro pueda SALIR de Montero hacia Santa Cruz
  MINIMO_PASAJEROS_MONTERO: 15,

  // Mínimo de pasajeros para que el micro pueda SALIR de Santa Cruz hacia Montero
  MINIMO_PASAJEROS_SANTA_CRUZ: 10,

  // Máximo de micros activos por dirección (regla del sindicato)
  MAX_MICROS_POR_DIRECCION: 1,

  // Orígenes válidos — cualquier dato que llegue fuera de estos se rechaza
  ORIGENES_VALIDOS: ['montero', 'santa_cruz'],

  // Cada cuántos milisegundos el chofer envía su posición GPS
  // 5000ms = 5 segundos. Suficiente para tracking en tiempo real sin agotar la batería.
  INTERVALO_GPS_MS: 5000,
};
