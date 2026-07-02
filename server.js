import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = process.env.PORT || 3000;

const history = [];
const clients = new Map();
const radioStart = Date.parse("2026-07-02T00:00:00.000Z");

app.use(express.static("public"));

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

wss.on("connection", (socket) => {
  const guestName = `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
  clients.set(socket, guestName);

  socket.send(JSON.stringify({
    type: "hello",
    name: guestName,
    history,
    radio: {
      start: radioStart,
      serverTime: Date.now()
    }
  }));
  broadcast({ type: "presence", count: clients.size });

  socket.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "rename") {
      const name = cleanText(data.name, 24);
      clients.set(socket, name || guestName);
      socket.send(JSON.stringify({ type: "renamed", name: clients.get(socket) }));
      return;
    }

    if (data.type !== "message") return;

    const text = cleanText(data.text, 500);
    if (!text) return;

    const item = {
      id: crypto.randomUUID(),
      name: clients.get(socket) || guestName,
      text,
      time: new Date().toISOString()
    };

    history.push(item);
    if (history.length > 80) history.shift();
    broadcast({ type: "message", message: item });
  });

  socket.on("close", () => {
    clients.delete(socket);
    broadcast({ type: "presence", count: clients.size });
  });
});

server.listen(port, () => {
  console.log(`Chat room listening on http://localhost:${port}`);
});
