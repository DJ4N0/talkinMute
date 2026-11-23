
(() => {
"use strict";

const KEY = "messageScreenState";
const ROOM_KEY = "messageScreenRoom";

const $ = id => document.getElementById(id);
const projectionMode = location.pathname.endsWith("projection.html");

let db = null;
let roomId = "";let currentColor = "#ed1824";
let roomRef = null;
let unsubscribe = null;
let messages = [];
let applyingRemote = false;
let debounceTimer = null;

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function getState() {
  return {
    text: $("messageInput")?.value ?? loadLocal().text ?? "hello",
    color: $("screen").style.backgroundColor || loadLocal().color || "#ed1824",
    size: $("fontSize")?.value || loadLocal().size || 76,
    scrolling: $("scrollToggle")?.checked ?? !!loadLocal().scrolling
  };
}

function applyState(state) {
  if (!state) return;

  applyingRemote = true;

  const text = state.text ?? "hello";
  const color = state.color || "#ed1824";
  const size = Number(state.size) || 76;
  const scrolling = !!state.scrolling;

  $("displayText").textContent = text || "hello";
  $("screen").style.backgroundColor = color;
  $("displayText").style.fontSize = size + "px";
  $("screen").classList.toggle("scrolling", scrolling);

  if (!projectionMode) {
    $("messageInput").value = text;
    $("fontSize").value = size;
    $("scrollToggle").checked = scrolling;

    document.querySelectorAll(".color").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.color.toLowerCase() === color.toLowerCase()
      );
    });
  }

  localStorage.setItem(KEY, JSON.stringify(state));
  applyingRemote = false;
}

function updateStatus(message) {
  const element = $("status") || $("messageStatus");
  if (element) element.textContent = message;
}

function saveLocal() {
  const state = getState();
  localStorage.setItem(KEY, JSON.stringify(state));
  applyState(state);
  return state;
}

function sendUpdate() {
  const state = saveLocal();

  if (!db || !roomId || projectionMode || !navigator.onLine) return;

  clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    roomRef.child("state").set(state).catch(error => {
      updateStatus("Errore sincronizzazione: " + error.message);
    });
  }, 100);
}

function subscribeRoom(id) {
  if (!db) {
    updateStatus("Firebase non disponibile.");
    return;
  }

  if (unsubscribe) unsubscribe();

  roomId = id.toUpperCase();
  localStorage.setItem(ROOM_KEY, roomId);
  roomRef = db.ref("rooms/" + roomId);

  unsubscribe = roomRef.child("state").on("value", snapshot => {
    const state = snapshot.val();

    if (state) applyState(state);

    if (!projectionMode) {
      $("roomInfo").hidden = false;
      $("roomCode").textContent = roomId;
      updateStatus("Stanza collegata: " + roomId);
    } else {
      updateStatus(state ? "Collegato" : "In attesa della regia...");
    }
  }, error => {
    updateStatus("Errore: " + error.message);
  });
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, byte => chars[byte % chars.length]).join("");
}

async function initializeFirebase() {
  if (!window.firebase || !window.firebaseConfig ||
      !firebaseConfig.apiKey ||
      firebaseConfig.apiKey.startsWith("INSERISCI") ||
      !firebaseConfig.databaseURL ||
      firebaseConfig.databaseURL.startsWith("https://TUO-")) {
    updateStatus("Modalità locale: configura Firebase per collegare i telefoni.");
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    await firebase.auth().signInAnonymously();
    db = firebase.database();

    updateStatus("Connesso a Firebase.");

    if (projectionMode) {
      const id = new URLSearchParams(location.search).get("room");

      if (!id) {
        updateStatus("Manca il codice della stanza.");
        return;
      }

      subscribeRoom(id);
    } else {
      const previous = localStorage.getItem(ROOM_KEY);

      if (previous) {
        subscribeRoom(previous);
      }
    }

  } catch (error) {
    console.error(error);
    updateStatus("Connessione non disponibile. Controlla Firebase e Internet.");
  }
}

if (!projectionMode) {

  messages = loadLocal().messages || [];

  function renderMessages() {
    const list = $("savedList");
    list.innerHTML = "";

    if (!messages.length) {
      const p = document.createElement("p");
      p.textContent = "Nessun messaggio salvato.";
      p.style.color = "#999";
      list.appendChild(p);
      return;
    }

    messages.forEach((message, index) => {
      const item = document.createElement("div");
      item.className = "saved-item";

      const select = document.createElement("button");
      select.className = "saved-text";
      select.textContent = message;
      select.onclick = () => {
        $("messageInput").value = message;
        sendUpdate();
      };

      const remove = document.createElement("button");
      remove.className = "delete";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Elimina messaggio");
      remove.onclick = () => {
        messages.splice(index, 1);
        saveMessages();
        renderMessages();
      };

      item.append(select, remove);
      list.appendChild(item);
    });
  }

  function saveMessages() {
    const data = loadLocal();
    data.messages = messages;
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  $("messageInput").addEventListener("input", sendUpdate);

  $("fontSize").addEventListener("input", sendUpdate);

  $("scrollToggle").addEventListener("change", sendUpdate);

  document.querySelectorAll(".color").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".color").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      $("screen").style.backgroundColor = button.dataset.color;
      sendUpdate();
    });
  });

  $("clearBtn").onclick = () => {
    $("messageInput").value = "";
    sendUpdate();
  };

  $("saveBtn").onclick = () => {
    const text = $("messageInput").value.trim();

    if (!text) return alert("Scrivi prima un messaggio!");
    if (messages.includes(text)) return alert("Messaggio già salvato!");

    messages.unshift(text);
    saveMessages();
    renderMessages();
  };

  $("createRoom").onclick = async () => {
    if (!db) {
      alert("Configura Firebase e verifica la connessione Internet.");
      return;
    }

    const button = $("createRoom");
    button.disabled = true;

    try {
      const id = randomRoomCode();
      const ref = db.ref("rooms/" + id);

      await ref.child("state").set(getState());

      subscribeRoom(id);
    } catch (error) {
      alert("Impossibile creare la stanza: " + error.message);
    } finally {
      button.disabled = false;
    }
  };

  $("joinRoom").onclick = () => {
    const code = $("joinCode").value.trim().toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code)) {
      alert("Inserisci un codice valido di 12 caratteri.");
      return;
    }

    if (!db) {
      alert("Firebase non è disponibile.");
      return;
    }

    subscribeRoom(code);
  };

  $("copyCode").onclick = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      updateStatus("Codice copiato!");
    } catch {
      updateStatus("Codice stanza: " + roomId);
    }
  };

  $("copyLink").onclick = async () => {
    const url = new URL("projection.html", location.href);
    url.searchParams.set("room", roomId);

    try {
      await navigator.clipboard.writeText(url.href);
      updateStatus("Link di proiezione copiato!");
    } catch {
      updateStatus("Link: " + url.href);
    }
  };

  $("showBtn").onclick = () => {
    const url = new URL("projection.html", location.href);

    if (roomId) url.searchParams.set("room", roomId);

    window.open(url.href, "messageProjection");
  };

  const initial = loadLocal();
  applyState(initial);
  renderMessages();

} else {

  const initial = loadLocal();
  applyState(initial);

  $("exitBtn").onclick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    window.close();
  };

  $("screen").addEventListener("dblclick", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });
}

window.addEventListener("online", () => {
  updateStatus("Connessione Internet ripristinata.");
});

window.addEventListener("offline", () => {
  updateStatus("Offline: sincronizzazione sospesa.");
});

initializeFirebase();

})();
