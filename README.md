# Micros Montero–Santa Cruz — MVP

Sistema de rastreo en tiempo real para el tramo Montero → Santa Cruz (Bolivia).  
Stack: **Node.js + Express + Socket.io + PostgreSQL + Leaflet/OSM**  
Hosting: **Render** (backend) + **Vercel** (frontend) — ambos en plan gratuito

---

## Estructura del proyecto

```
micros-mvp/
├── backend/
│   ├── config/
│   │   └── reglas.js          ← Mínimos de pasajeros y constantes del negocio
│   └── src/
│       ├── db/
│       │   ├── pool.js        ← Conexión a PostgreSQL con pool de conexiones
│       │   ├── queries.js     ← Todas las consultas SQL centralizadas
│       │   └── schema.sql     ← Estructura de las tablas (ejecutar 1 vez)
│       ├── middleware/
│       │   └── validar.js     ← Validación de datos antes de llegar al controlador
│       ├── routes/
│       │   ├── rutas.js       ← API REST: iniciar, salir, posición, finalizar
│       │   └── pasajeros.js   ← API REST: anunciarse, listar pasajeros
│       ├── socket/
│       │   └── socketHandler.js ← Lógica de WebSockets (tiempo real)
│       └── index.js           ← Punto de entrada: Express + Socket.io
└── frontend/
    ├── public/
    │   ├── pasajero.html      ← Pantalla del pasajero (mapa + anunciarse)
    │   └── sindicato.html     ← Panel del chofer (iniciar/terminar ruta)
    └── src/
        ├── pages/
        │   ├── pasajero.js    ← Lógica de la pantalla del pasajero
        │   └── sindicato.js   ← Lógica del panel del chofer
        └── utils/
            ├── api.js         ← Todas las llamadas REST al backend
            └── socket.js      ← Singleton de la conexión WebSocket
```

---

## Setup local (paso a paso)

### 1. Base de datos PostgreSQL

Necesitás PostgreSQL instalado localmente o podés usar [Railway](https://railway.app) / [Supabase](https://supabase.com) solo por la DB.

```bash
# Crear la base de datos
psql -U postgres -c "CREATE DATABASE micros_db;"

# Crear las tablas
psql -U postgres -d micros_db -f backend/src/db/schema.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Editá .env con tu DATABASE_URL real
npm run dev
```

El servidor arranca en `http://localhost:3001`

### 3. Frontend

El frontend es HTML + JS plano — no necesita bundler.  
Abrí `frontend/public/pasajero.html` y `sindicato.html` directamente en el navegador,  
o usá Live Server de VS Code.

---

## Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Verifica que el servidor está vivo |
| GET | `/api/rutas/activas` | Lista rutas en estado 'esperando' o 'en_camino' |
| POST | `/api/rutas/iniciar` | Crea una nueva ruta (chofer + origen) |
| POST | `/api/rutas/:id/salir` | Valida mínimo y cambia estado a 'en_camino' |
| PATCH | `/api/rutas/:id/posicion` | Actualiza lat/lng del micro |
| POST | `/api/rutas/:id/finalizar` | Marca la ruta como 'finalizada' |
| POST | `/api/pasajeros/anunciarse` | Registra un pasajero con su ubicación |
| GET | `/api/pasajeros/ruta/:id` | Lista los pasajeros de una ruta |

---

## Eventos de Socket.io

### Emitidos por el cliente → servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `unirse_a_ruta` | `rutaId` | Suscribirse a los eventos de una ruta |
| `actualizar_posicion` | `{ ruta_id, lat, lng }` | GPS del chofer |
| `pasajero_anunciado` | `{ ruta_id, lat, lng }` | Avisa que hay un nuevo pasajero |
| `ruta_salio` | `{ ruta_id }` | El micro salió |
| `ruta_terminada` | `{ ruta_id }` | El micro llegó al destino |

### Emitidos por el servidor → cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `posicion_actualizada` | `{ ruta_id, lat, lng, timestamp }` | Mueve el marcador del micro |
| `nuevo_pasajero` | `{ ruta_id, total_pasajeros, lat, lng }` | Actualiza contador + marcador |
| `ruta_en_camino` | `{ ruta_id, mensaje }` | El micro salió (aviso a pasajeros) |
| `ruta_finalizada` | `{ ruta_id, mensaje }` | El micro llegó (limpiar mapa) |

---

## Reglas de negocio

- **Montero → Santa Cruz**: mínimo **15 pasajeros** para salir
- **Santa Cruz → Montero**: mínimo **10 pasajeros** para salir
- Máximo **1 micro activo por dirección** al mismo tiempo
- Los pasajeros **no necesitan crear cuenta** — solo comparten su ubicación
- Las validaciones de salida siempre ocurren en el **backend** (no confiar en el frontend)

---

## Deploy en producción (gratis)

### Backend → Render

1. Subí el proyecto a GitHub
2. Creá un nuevo "Web Service" en [render.com](https://render.com)
3. Root directory: `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Agregá las variables de entorno (DATABASE_URL, FRONTEND_URL, NODE_ENV=production)

### Base de datos → Render PostgreSQL (o Neon.tech)

Render tiene un plan gratuito de PostgreSQL. Creá una base y copiá el connection string.

### Frontend → Vercel

1. En `pasajero.html` y `sindicato.html`, cambiá `window.ENV_BACKEND_URL` a la URL de Render
2. Subí la carpeta `frontend` a GitHub
3. Importá en [vercel.com](https://vercel.com) — detecta HTML estático automáticamente

---

## Para la presentación — qué podés explicar

- **Por qué pool de conexiones en vez de conexión directa** (eficiencia, no saturar la DB)
- **Por qué parámetros preparados en SQL** (prevenir SQL injection)
- **Por qué la validación está en el backend Y en el frontend** (el frontend es decorativo, el backend es la fuente de verdad)
- **Cómo funcionan las "rooms" de Socket.io** (cada ruta tiene su sala, los eventos no se mezclan)
- **Por qué watchPosition en vez de setInterval para el GPS** (solo dispara cuando hay movimiento real)
- **El patrón Singleton para la conexión WebSocket** (una sola conexión compartida)
