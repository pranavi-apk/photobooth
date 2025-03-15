// DOM Elements
const roomSetup = document.getElementById("roomSetup");
const roomDiv = document.getElementById("room");
const roomIdInput = document.getElementById("roomId");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomNameSpan = document.getElementById("roomName");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const statusDiv = document.getElementById("status");
const captureBtn = document.getElementById("captureBtn");
const canvas = document.getElementById("canvas");
const preview = document.getElementById("preview");
const downloadBtn = document.getElementById("downloadBtn");
const photoCountDisplay = document.getElementById("photoCount");

// Global state
let localStream = null;
let peerConnection = null;
let currentRoom = null;
let photoCount = 0;
let capturedPhotos = [];

// Connect to Socket.IO server
const socket = io("http://localhost:3000", {
  reconnectionAttempts: 5,
  timeout: 10000,
});

// Initialize UI state
createRoomBtn.disabled = true;
joinRoomBtn.disabled = true;

// Show status message
function showStatus(message, isError = false) {
  statusDiv.textContent = message;
  statusDiv.style.display = "block";
  statusDiv.className = isError ? "error" : "success";
  setTimeout(() => {
    statusDiv.style.display = "none";
  }, 5000);
}

// Socket.IO event handlers
socket.on("connect", () => {
  showStatus("Connected to server");
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
});

socket.on("connect_error", (error) => {
  showStatus(
    "Failed to connect to server. Please check if the server is running.",
    true
  );
  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
});

socket.on("roomError", (error) => {
  showStatus(error, true);
});

socket.on("roomCreated", (roomId) => {
  showStatus(`Room ${roomId} created successfully`);
  enterRoom(roomId);
});

socket.on("roomJoined", (roomId) => {
  showStatus(`Joined room ${roomId}`);
  enterRoom(roomId);
});

socket.on("userJoined", (userId) => {
  showStatus("Another user joined the room");
  createPeerConnection();
  createOffer();
});

socket.on("userLeft", () => {
  showStatus("The other user left the room");
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
    remoteVideo.srcObject = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  captureBtn.disabled = true;
});

// Get user media
async function setupLocalStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    localStream = stream;
    localVideo.srcObject = stream;
    return true;
  } catch (err) {
    console.error("Error accessing webcam:", err);
    showStatus(
      "Failed to access webcam. Please make sure you have a camera connected and have granted permission to use it.",
      true
    );
    return false;
  }
}

// Room management
function enterRoom(roomId) {
  currentRoom = roomId;
  roomSetup.style.display = "none";
  roomDiv.style.display = "block";
  roomNameSpan.textContent = roomId;
}

// Button event listeners
createRoomBtn.addEventListener("click", async () => {
  const roomId = roomIdInput.value.trim();
  if (!roomId) {
    showStatus("Please enter a room ID", true);
    return;
  }

  if (!localStream) {
    const success = await setupLocalStream();
    if (!success) return;
  }

  socket.emit("createRoom", roomId);
});

joinRoomBtn.addEventListener("click", async () => {
  const roomId = roomIdInput.value.trim();
  if (!roomId) {
    showStatus("Please enter a room ID", true);
    return;
  }

  if (!localStream) {
    const success = await setupLocalStream();
    if (!success) return;
  }

  socket.emit("joinRoom", roomId);
});

// Function to update photo counter displays
function updatePhotoCounters() {
  photoCountDisplay.textContent = photoCount;
  captureBtn.textContent = `📸 Take Photo (${photoCount}/4)`;
}

// Photo capture functionality
captureBtn.addEventListener("click", () => {
  // Wait for videos to be ready
  if (!localVideo.videoWidth || !remoteVideo.videoWidth) {
    showStatus("Please wait for video streams to load fully", true);
    return;
  }

  // Calculate dimensions while maintaining aspect ratio
  const aspectRatio = localVideo.videoHeight / localVideo.videoWidth;
  const targetWidth = 480; // Same as video width in CSS
  const targetHeight = targetWidth * aspectRatio;

  // Set canvas size to fit both videos side by side
  canvas.width = targetWidth * 2; // Two videos side by side
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");

  // Clear canvas with white background (instead of dark background)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw local video (mirrored) with exact dimensions
  ctx.save();
  ctx.translate(targetWidth, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(localVideo, 0, 0, targetWidth, targetHeight);
  ctx.restore();

  // Draw remote video with exact dimensions, right next to the local video
  ctx.drawImage(remoteVideo, targetWidth, 0, targetWidth, targetHeight);

  // Show preview
  preview.src = canvas.toDataURL("image/png");
  preview.style.display = "block";
  downloadBtn.style.display = "inline-block";

  // Store the photo
  capturedPhotos.push(preview.src);
  photoCount++;
  updatePhotoCounters();

  // Play camera shutter sound
  const shutterSound = new Audio(
    "data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU="
  );
  shutterSound.play();

  // If we have 4 photos, store them and redirect to editor
  if (photoCount === 4) {
    localStorage.setItem("photoboothPhotos", JSON.stringify(capturedPhotos));
    window.location.href = "editor.html";
  } else {
    showStatus(`Photo ${photoCount}/4 captured!`);
  }
});

// Download functionality
downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `photobooth-${new Date().toISOString()}.png`;
  link.href = preview.src;
  link.click();
});

// WebRTC functions
function createPeerConnection() {
  try {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      // Enable capture button once we have both streams
      captureBtn.disabled = false;
    };

    // ICE Candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          target: currentRoom,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      if (
        peerConnection.iceConnectionState === "failed" ||
        peerConnection.iceConnectionState === "disconnected"
      ) {
        showStatus("Connection lost. Please refresh and try again.", true);
      }
    };

    return true;
  } catch (err) {
    console.error("Error creating peer connection:", err);
    showStatus("Failed to create peer connection", true);
    return false;
  }
}

async function createOffer() {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", {
      target: currentRoom,
      offer: peerConnection.localDescription,
    });
  } catch (err) {
    console.error("Error creating offer:", err);
    showStatus("Failed to create connection offer", true);
  }
}

// WebRTC signaling handlers
socket.on("offer", async (data) => {
  try {
    if (!peerConnection) {
      createPeerConnection();
    }
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.offer)
    );
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", {
      target: data.target,
      answer: peerConnection.localDescription,
    });
  } catch (err) {
    console.error("Error handling offer:", err);
    showStatus("Failed to handle connection offer", true);
  }
});

socket.on("answer", async (data) => {
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.answer)
    );
  } catch (err) {
    console.error("Error handling answer:", err);
    showStatus("Failed to establish connection", true);
  }
});

socket.on("ice-candidate", async (data) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error("Error adding ICE candidate:", err);
  }
});

// Initialize webcam on page load
setupLocalStream();
