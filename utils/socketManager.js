const { Server } = require('socket.io');

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*", // Configure this based on your frontend domain
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Handle joining progress room
      socket.on('joinProgress', (progressId) => {
        socket.join(`progress_${progressId}`);
        console.log(`Client ${socket.id} joined progress room: progress_${progressId}`);
      });

      // Handle leaving progress room
      socket.on('leaveProgress', (progressId) => {
        socket.leave(`progress_${progressId}`);
        console.log(`Client ${socket.id} left progress room: progress_${progressId}`);
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });

    return this.io;
  }

  emitToRoom(room, event, data) {
    if (this.io) {
      this.io.to(room).emit(event, data);
    }
  }

  emitToAll(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  leaveRoom(room) {
    if (this.io) {
      this.io.in(room).socketsLeave(room);
    }
  }

  getConnectedClientsCount() {
    return this.io ? this.io.engine.clientsCount : 0;
  }
}

// Singleton instance
const socketManager = new SocketManager();

module.exports = socketManager; 