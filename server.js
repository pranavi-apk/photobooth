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
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "wss:", "https:"],
      },
    },
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

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);
    socket.to(roomId).emit("user-connected", socket.id);
  });

  socket.on("disconnect", () => {
    // Clean up rooms
    rooms.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });

  socket.on("offer", (offer, roomId) => {
    socket.to(roomId).emit("offer", offer);
  });

  socket.on("answer", (answer, roomId) => {
    socket.to(roomId).emit("answer", answer);
  });

  socket.on("ice-candidate", (candidate, roomId) => {
    socket.to(roomId).emit("ice-candidate", candidate);
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
