const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: [
          "'self'",
          "wss://localhost:*",
          "https://localhost:*",
          "http://localhost:*",
        ],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
  })
);

// Enable CORS and compression
app.use(cors());
app.use(compression());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// WebRTC configuration with multiple TURN servers
const webRTCConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
      ],
    },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// Store active rooms and their participants
const rooms = new Map();

// Cleanup inactive rooms
const cleanupInactiveRooms = () => {
  rooms.forEach((room, roomId) => {
    if (room.participants.size === 0) {
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  });
};

// Run room cleanup every 5 minutes
setInterval(cleanupInactiveRooms, 5 * 60 * 1000);

// Cleanup function for photos
const cleanupPhotos = () => {
  const photosDir = path.join(__dirname, "public", "photos");
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
    return;
  }

  const files = fs.readdirSync(photosDir);
  const now = Date.now();
  files.forEach((file) => {
    const filePath = path.join(photosDir, file);
    const stats = fs.statSync(filePath);
    // Delete files older than 1 hour
    if (now - stats.mtimeMs > process.env.PHOTO_CLEANUP_INTERVAL) {
      fs.unlinkSync(filePath);
    }
  });
};

// Run cleanup every hour
setInterval(cleanupPhotos, process.env.PHOTO_CLEANUP_INTERVAL);

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("join-room", (roomId, isCreate = false) => {
    // Check if room exists
    if (!rooms.has(roomId)) {
      if (!isCreate) {
        socket.emit(
          "room-unavailable",
          "This room doesn't exist. Please create a new room or check the room ID."
        );
        return;
      }
      // Create new room
      rooms.set(roomId, {
        participants: new Set(),
        isOriginalRoom: true,
      });
      socket.join(roomId);
      rooms.get(roomId).participants.add(socket.id);
      socket.emit("room-joined", socket.id);
    } else if (
      rooms.get(roomId).participants.size < 2 &&
      rooms.get(roomId).isOriginalRoom
    ) {
      if (isCreate) {
        // Someone's trying to create a room that already exists
        socket.emit(
          "room-unavailable",
          "This room ID is already in use. Please try a different room ID."
        );
        return;
      }
      // Join existing room if it's the original and not full
      socket.join(roomId);
      rooms.get(roomId).participants.add(socket.id);
      socket.emit("room-joined", socket.id);
      socket.to(roomId).emit("user-connected", socket.id);
    } else {
      // Room is either full or someone's trying to create a duplicate
      socket.emit(
        "room-unavailable",
        "This room is full. Please try a different room ID."
      );
      return;
    }
  });

  socket.on("disconnect", () => {
    // Clean up rooms
    rooms.forEach((room, roomId) => {
      if (room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        if (room.participants.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });

  socket.on("offer", (offer, roomId) => {
    try {
      if (!rooms.has(roomId)) {
        socket.emit("error", "Room not found");
        return;
      }
      socket.to(roomId).emit("offer", offer);
    } catch (error) {
      console.error("Error handling offer:", error);
      socket.emit("error", "Failed to process offer");
    }
  });

  socket.on("answer", (answer, roomId) => {
    try {
      if (!rooms.has(roomId)) {
        socket.emit("error", "Room not found");
        return;
      }
      socket.to(roomId).emit("answer", answer);
    } catch (error) {
      console.error("Error handling answer:", error);
      socket.emit("error", "Failed to process answer");
    }
  });

  socket.on("ice-candidate", (candidate, roomId) => {
    try {
      if (!rooms.has(roomId)) {
        socket.emit("error", "Room not found");
        return;
      }
      socket.to(roomId).emit("ice-candidate", candidate);
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
      socket.emit("error", "Failed to process ICE candidate");
    }
  });

  socket.on("photo-taken", (data) => {
    const { roomId, photoData } = data;
    const timestamp = Date.now();
    const filename = `photo_${timestamp}.jpg`;
    const filepath = path.join(__dirname, "public", "photos", filename);

    // Remove the data URL prefix
    const base64Data = photoData.replace(/^data:image\/jpeg;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Check file size before saving
    if (buffer.length > process.env.MAX_PHOTO_SIZE) {
      socket.emit("error", "Photo size exceeds 5MB limit");
      return;
    }

    fs.writeFile(filepath, buffer, (err) => {
      if (err) {
        console.error("Error saving photo:", err);
        socket.emit("error", "Failed to save photo");
        return;
      }
      socket.to(roomId).emit("photo-saved", {
        filename,
        timestamp,
      });
    });
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
