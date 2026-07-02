import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = process.env.PORT || 3000;

const clients = new Map();
const radioStart = Date.parse("2026-07-02T00:00:00.000Z");
const radioTracks = shuffle([
  "/assets/hyper-glitter-dream.mp3",
  "/assets/glitchy-shiny-hearts.mp3",
  "/assets/digital-heartbeat-burst.mp3",
  "/assets/system-offline.mp3",
  "/assets/digital-static-shards.mp3",
  "/assets/digital-neural-flow.mp3",
  "/assets/resonant-signal.mp3",
  "/assets/dual-grid-signals.mp3"
]);
const roomLimit = 8;
const rooms = [
  { id: "neon-lobby", name: "Neon Lobby", history: [] },
  { id: "glitter-circuit", name: "Glitter Circuit", history: [] },
  { id: "static-roof", name: "Static Roof", history: [] },
  { id: "afterimage", name: "Afterimage", history: [] },
  { id: "pixel-shrine", name: "Pixel Shrine", history: [] },
  { id: "bass-orbit", name: "Bass Orbit", history: [] }
];

app.use(express.static("public"));

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function roomCount(roomId) {
  let count = 0;
  for (const client of clients.values()) {
    if (client.roomId === roomId) count += 1;
  }
  return count;
}

function publicRooms() {
  return rooms.map((room) => ({
    id: room.id,
    name: room.name,
    count: roomCount(room.id),
    roomy: roomCount(room.id) < roomLimit
  }));
}

function findRoom(id) {
  return rooms.find((room) => room.id === id) || rooms[0];
}

function quietestRoom() {
  return rooms.reduce((best, room) => {
    const count = roomCount(room.id);
    const bestCount = roomCount(best.id);
    if (count < bestCount) return room;
    return best;
  }, rooms[0]);
}

function broadcast(payload, roomId = null) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && (!roomId || clients.get(client)?.roomId === roomId)) {
      client.send(message);
    }
  }
}

function broadcastPresence() {
  broadcast({ type: "presence", rooms: publicRooms() });
}

function sendRoomState(socket, moved = false) {
  const client = clients.get(socket);
  const room = findRoom(client.roomId);
  socket.send(JSON.stringify({
    type: "room",
    roomId: room.id,
    roomName: room.name,
    moved,
    history: room.history,
    rooms: publicRooms()
  }));
}

wss.on("connection", (socket) => {
  const guestName = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
  const room = quietestRoom();
  clients.set(socket, { name: guestName, roomId: room.id });

  socket.send(JSON.stringify({
    type: "hello",
    name: guestName,
    roomId: room.id,
    roomName: room.name,
    rooms: publicRooms(),
    history: room.history,
    radio: {
      start: radioStart,
      serverTime: Date.now(),
      tracks: radioTracks
    }
  }));
  broadcastPresence();

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "rename") {
      const name = cleanText(data.name, 24);
      const client = clients.get(socket);
      client.name = name || guestName;
      socket.send(JSON.stringify({ type: "renamed", name: client.name }));
      return;
    }

    if (data.type === "room") {
      const client = clients.get(socket);
      const previousRoom = client.roomId;
      client.roomId = findRoom(data.roomId).id;
      if (previousRoom !== client.roomId) {
        sendRoomState(socket, true);
        broadcastPresence();
      }
      return;
    }

    if (data.type !== "message") return;

    const text = cleanText(data.text, 500);
    if (!text) return;

    const client = clients.get(socket);
    const room = findRoom(client.roomId);
    const item = {
      id: crypto.randomUUID(),
      name: client.name || guestName,
      text,
      time: new Date().toISOString(),
      roomId: room.id
    };

    room.history.push(item);
    if (room.history.length > 80) room.history.shift();
    broadcast({ type: "message", message: item }, room.id);
  });

  socket.on("close", () => {
    clients.delete(socket);
    broadcastPresence();
  });
});

server.listen(port, () => {
  console.log(`Chat room listening on http://localhost:${port}`);
});
