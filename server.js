const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(express.static("."));
app.use(express.json());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Routes
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/editor", (req, res) => {
  res.sendFile(__dirname + "/editor.html");
});

// Room management
const rooms = new Map();

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Room creation
  socket.on("createRoom", (roomId) => {
    try {
      if (rooms.has(roomId)) {
        socket.emit("roomError", "Room already exists");
        return;
      }

      rooms.set(roomId, new Set([socket.id]));
      socket.join(roomId);
      socket.emit("roomCreated", roomId);
      console.log(`Room ${roomId} created by ${socket.id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit("roomError", "Failed to create room");
    }
  });

  // Room joining
  socket.on("joinRoom", (roomId) => {
    try {
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
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("roomError", "Failed to join room");
    }
  });

  // WebRTC signaling
  socket.on("offer", (data) => {
    try {
      socket.to(data.target).emit("offer", {
        offer: data.offer,
        target: socket.id,
      });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  });

  socket.on("answer", (data) => {
    try {
      socket.to(data.target).emit("answer", {
        answer: data.answer,
        target: socket.id,
      });
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  });

  socket.on("ice-candidate", (data) => {
    try {
      socket.to(data.target).emit("ice-candidate", {
        candidate: data.candidate,
        target: socket.id,
      });
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
    }
  });

  // Disconnection handling
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    try {
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
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  });
});

// For Vercel deployment
module.exports = app;

// For local development
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
  });
}
