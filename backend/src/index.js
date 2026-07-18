// index.js — Punto de entrada del servidor
// Sin base de datos: todo en memoria (store.js)
// Stack: Express + Socket.io corriendo en el mismo puerto

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const rutasRouter     = require('./routes/rutas');
const pasajerosRouter = require('./routes/pasajeros');
const { inicializarSocket } = require('./socket/socketHandler');

const app    = express();
const server = http.createServer(app);

// Socket.io adjuntado al mismo servidor HTTP
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH'] }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas de la API
app.use('/api/rutas',     rutasRouter);
app.use('/api/pasajeros', pasajerosRouter);

app.get('/health', (req, res) => {
  res.json({ estado: 'ok', timestamp: new Date().toISOString() });
});

app.use('/', (req, res) => {
  res.status(404).json({ error: `Ruta ${req.originalUrl} no encontrada` });
});

// Inicializar WebSockets
inicializarSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(` •Servidor corriendo en http://localhost:${PORT}`);
  console.log(` •WebSockets listos`);
  console.log(` •Usando almacenamiento en memoria (sin base de datos)`);
});
