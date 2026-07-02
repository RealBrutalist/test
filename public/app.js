const messages = document.querySelector("#messages");
const composer = document.querySelector("#composer");
const messageInput = document.querySelector("#message");
const nameInput = document.querySelector("#name");
const statusText = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const template = document.querySelector("#message-template");
const musicButton = document.querySelector("#music");
const roomSelect = document.querySelector("#room");
const tracks = [
  { src: "/assets/hyper-glitter-dream.mp3", duration: 0 },
  { src: "/assets/glitchy-shiny-hearts.mp3", duration: 0 },
  { src: "/assets/digital-heartbeat-burst.mp3", duration: 0 },
  { src: "/assets/system-offline.mp3", duration: 0 },
  { src: "/assets/digital-static-shards.mp3", duration: 0 }
];
const musicTrack = new Audio(tracks[0].src);

let socket;
let myName = localStorage.getItem("chat-name") || "";
let reconnectTimer;
let trackIndex = 0;
let radioStart = Date.parse("2026-07-02T00:00:00.000Z");
let serverOffset = 0;
let radioTimer;
let audioContext;
let soundUnlocked = false;
let currentRoomId = "";

musicTrack.volume = 0.45;

nameInput.value = myName;

function setStatus(text, online = false) {
  statusText.textContent = text;
  statusDot.classList.toggle("online", online);
}

function renderRooms(rooms = []) {
  const selected = roomSelect.value || currentRoomId;
  roomSelect.replaceChildren(...rooms.map((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = `${room.name} (${room.count})`;
    if (!room.roomy) option.textContent += " busy";
    return option;
  }));

  if (rooms.some((room) => room.id === selected)) {
    roomSelect.value = selected;
  }
}

function enterRoom(data) {
  currentRoomId = data.roomId;
  renderRooms(data.rooms);
  roomSelect.value = currentRoomId;
  messages.replaceChildren();
  data.history.forEach(renderMessage);
  setStatus(data.moved ? `Moved to ${data.roomName}` : `${data.roomName}`, true);
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function renderMessage(item) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.classList.toggle("mine", item.name === myName);
  node.querySelector("strong").textContent = item.name;
  node.querySelector("p").textContent = item.text;

  const time = node.querySelector("time");
  const date = new Date(item.time);
  time.dateTime = item.time;
  time.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
}

function unlockSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext ||= new AudioContext();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  soundUnlocked = true;
  return audioContext;
}

function messageBlip(isMine = false) {
  if (!soundUnlocked) return;
  const context = unlockSound();
  if (!context) return;

  const now = context.currentTime;
  const gain = context.createGain();
  const primary = context.createOscillator();
  const sparkle = context.createOscillator();

  primary.type = "triangle";
  sparkle.type = "sine";
  primary.frequency.setValueAtTime(isMine ? 720 : 520, now);
  primary.frequency.exponentialRampToValueAtTime(isMine ? 1180 : 860, now + 0.08);
  sparkle.frequency.setValueAtTime(isMine ? 1440 : 1040, now + 0.025);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  primary.connect(gain);
  sparkle.connect(gain);
  gain.connect(context.destination);
  primary.start(now);
  sparkle.start(now + 0.025);
  primary.stop(now + 0.17);
  sparkle.stop(now + 0.13);
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener("open", () => {
    setStatus("Online", true);
    if (myName) send({ type: "rename", name: myName });
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "hello") {
      if (data.radio) {
        radioStart = data.radio.start;
        serverOffset = data.radio.serverTime - Date.now();
      }

      if (!myName) {
        myName = data.name;
        nameInput.value = myName;
        localStorage.setItem("chat-name", myName);
      }
      enterRoom(data);
    }

    if (data.type === "renamed") {
      myName = data.name;
      nameInput.value = myName;
      localStorage.setItem("chat-name", myName);
    }

    if (data.type === "presence") {
      renderRooms(data.rooms);
    }

    if (data.type === "room") {
      enterRoom(data);
    }

    if (data.type === "message") {
      renderMessage(data.message);
      messageBlip(data.message.name === myName);
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Reconnecting");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1200);
  });
}

async function loadTrackDurations() {
  await Promise.all(tracks.map((track) => new Promise((resolve) => {
    const probe = new Audio(track.src);
    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => {
      track.duration = Number.isFinite(probe.duration) ? probe.duration : 0;
      resolve();
    }, { once: true });
    probe.addEventListener("error", resolve, { once: true });
  })));
}

function currentRadioPosition() {
  const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
  if (!totalDuration) return { index: 0, offset: 0 };

  const stationNow = Date.now() + serverOffset;
  let position = ((stationNow - radioStart) / 1000) % totalDuration;
  if (position < 0) position += totalDuration;

  for (let index = 0; index < tracks.length; index += 1) {
    if (position < tracks[index].duration) {
      return { index, offset: position };
    }
    position -= tracks[index].duration;
  }

  return { index: 0, offset: 0 };
}

function tuneRadio() {
  const position = currentRadioPosition();
  trackIndex = position.index;
  const selected = tracks[trackIndex];

  if (!musicTrack.src.endsWith(selected.src)) {
    musicTrack.src = selected.src;
  }

  if (Math.abs(musicTrack.currentTime - position.offset) > 1.2) {
    musicTrack.currentTime = Math.max(0, Math.min(position.offset, selected.duration - 0.25));
  }
}

nameInput.addEventListener("change", () => {
  myName = nameInput.value.trim().slice(0, 24);
  localStorage.setItem("chat-name", myName);
  send({ type: "rename", name: myName });
});

roomSelect.addEventListener("change", () => {
  send({ type: "room", roomId: roomSelect.value });
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  unlockSound();
  const text = messageInput.value.trim();
  if (!text) return;
  composer.classList.remove("sending");
  void composer.offsetWidth;
  composer.classList.add("sending");
  send({ type: "message", text });
  messageInput.value = "";
  messageInput.focus();
});

composer.addEventListener("animationend", () => {
  composer.classList.remove("sending");
});

function toggleMusic() {
  unlockSound();
  const isOn = musicButton.getAttribute("aria-pressed") === "true";
  if (isOn) {
    clearInterval(radioTimer);
    musicTrack.pause();
    musicButton.setAttribute("aria-pressed", "false");
    musicButton.textContent = "Radio";
    return;
  }

  tuneRadio();
  musicTrack.play().then(() => {
    clearInterval(radioTimer);
    radioTimer = setInterval(tuneRadio, 5000);
    musicButton.setAttribute("aria-pressed", "true");
    musicButton.textContent = "Mute";
  }).catch(() => {
    musicButton.textContent = "Tap again";
  });
}

musicButton.addEventListener("click", toggleMusic);
musicTrack.addEventListener("ended", () => {
  tuneRadio();
  musicTrack.play();
});

loadTrackDurations();
connect();
