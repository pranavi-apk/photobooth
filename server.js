const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.static(".")); // Serve static files from current directory

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createRoom", (roomId) => {
    if (rooms.has(roomId)) {
      socket.emit("roomError", "Room already exists");
      return;
    }

    rooms.set(roomId, new Set([socket.id]));
    socket.join(roomId);
    socket.emit("roomCreated", roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on("joinRoom", (roomId) => {
    if (!rooms.has(roomId)) {
      socket.emit("roomError", "Room does not exist");
      return;
    }

    const room = rooms.get(roomId);
    if (room.size >= 2) {
      socket.emit("roomError", "Room is full");
      return;
    }

    room.add(socket.id);
    socket.join(roomId);
    socket.emit("roomJoined", roomId);
    socket.to(roomId).emit("userJoined", socket.id);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle WebRTC signaling
  socket.on("offer", (data) => {
    socket.to(data.target).emit("offer", {
      offer: data.offer,
      target: socket.id,
    });
  });

  socket.on("answer", (data) => {
    socket.to(data.target).emit("answer", {
      answer: data.answer,
      target: socket.id,
    });
  });

  socket.on("ice-candidate", (data) => {
    socket.to(data.target).emit("ice-candidate", {
      candidate: data.candidate,
      target: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Remove user from all rooms
    rooms.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        if (users.size === 0) {
          rooms.delete(roomId);
        }
        io.to(roomId).emit("userLeft", socket.id);
      }
    });
  });
});

const PORT = 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
