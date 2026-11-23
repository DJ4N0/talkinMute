
(() => {
    "use strict";

    /* =========================================
       CONFIGURAZIONE APPLICAZIONE
    ========================================= */

    const KEY = "messageScreenState";
    const ROOM_KEY = "messageScreenRoom";

    const $ = id => document.getElementById(id);

    const projectionMode = location.pathname
        .toLowerCase()
        .endsWith("/projection.html");

    let db = null;
    let roomId = "";
    let roomRef = null;
    let roomListener = null;

    let messages = [];
    let debounceTimer = null;
    let applyingRemote = false;

    /* =========================================
       STORAGE LOCALE
    ========================================= */

    function loadLocal() {
        try {
            return JSON.parse(localStorage.getItem(KEY)) || {};
        } catch (error) {
            console.error("Errore lettura storage:", error);
            return {};
        }
    }

    function saveStorage(data) {
        try {
            const previous = loadLocal();

            localStorage.setItem(
                KEY,
                JSON.stringify({
                    ...previous,
                    ...data
                })
            );
        } catch (error) {
            console.error("Errore salvataggio locale:", error);
            updateStatus("Impossibile salvare i dati localmente.");
        }
    }

    /* =========================================
       STATO APPLICAZIONE
    ========================================= */

    function getState() {
        const saved = loadLocal();

        return {
            text: $("messageInput")?.value ?? saved.text ?? "hello",

            color:
                $("screen")?.style.backgroundColor ||
                saved.color ||
                "#ed1824",

            size:
                Number($("fontSize")?.value) ||
                Number(saved.size) ||
                76,

            scrolling:
                $("scrollToggle")?.checked ??
                !!saved.scrolling
        };
    }

    function applyState(state) {
        if (!state) return;

        applyingRemote = true;

        try {
            const text = state.text ?? "hello";
            const color = state.color || "#ed1824";
            const size = Number(state.size) || 76;
            const scrolling = !!state.scrolling;

            if ($("displayText")) {
                $("displayText").textContent = text || "hello";
                $("displayText").style.fontSize = size + "px";
            }

            if ($("screen")) {
                $("screen").style.backgroundColor = color;
                $("screen").classList.toggle("scrolling", scrolling);
            }

            if (!projectionMode) {
                if ($("messageInput")) {
                    $("messageInput").value = text;
                }

                if ($("fontSize")) {
                    $("fontSize").value = size;
                }

                if ($("scrollToggle")) {
                    $("scrollToggle").checked = scrolling;
                }

                document.querySelectorAll(".color").forEach(button => {
                    button.classList.toggle(
                        "active",
                        button.dataset.color?.toLowerCase() === color.toLowerCase()
                    );
                });
            }

            // Mantiene anche i messaggi salvati precedentemente.
            saveStorage({
                text,
                color,
                size,
                scrolling
            });

        } finally {
            applyingRemote = false;
        }
    }

    function saveLocal() {
        const state = getState();

        saveStorage(state);
        applyState(state);

        return state;
    }

    /* =========================================
       STATO E MESSAGGI
    ========================================= */

    function updateStatus(message) {
        const element = $("status") || $("messageStatus");

        if (element) {
            element.textContent = message;
        }
    }

    /* =========================================
       SINCRONIZZAZIONE FIREBASE
    ========================================= */

    function sendUpdate() {
        if (applyingRemote || projectionMode) return;

        const state = saveLocal();

        // Senza stanza, l'applicazione funziona localmente.
        if (!db || !roomId || !roomRef || !navigator.onLine) {
            return;
        }

        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
            try {
                await roomRef.child("state").set(state);
                updateStatus("Stanza collegata: " + roomId);
            } catch (error) {
                console.error("Errore sincronizzazione:", error);

                updateStatus(
                    "Errore sincronizzazione: " + error.message
                );
            }
        }, 150);
    }

    /* =========================================
       GESTIONE STANZE
    ========================================= */

    function detachRoomListener() {
        if (roomRef && roomListener) {
            roomRef.child("state").off("value", roomListener);
        }

        roomListener = null;
        roomRef = null;
    }

    function subscribeRoom(id) {
        if (!db) {
            updateStatus("Firebase non disponibile.");
            return;
        }

        detachRoomListener();

        roomId = id.toUpperCase();

        localStorage.setItem(ROOM_KEY, roomId);

        roomRef = db.ref("rooms/" + roomId);

        roomListener = snapshot => {
            const state = snapshot.val();

            if (state) {
                applyState(state);
            }

            if (!projectionMode) {
                if ($("roomInfo")) {
                    $("roomInfo").hidden = false;
                }

                if ($("roomCode")) {
                    $("roomCode").textContent = roomId;
                }

                updateStatus("Stanza collegata: " + roomId);

            } else {
                updateStatus(
                    state
                        ? "Collegato alla regia."
                        : "In attesa della regia..."
                );
            }
        };

        roomRef.child("state").on(
            "value",
            roomListener,
            error => {
                console.error("Errore lettura stanza:", error);

                updateStatus(
                    "Errore stanza: " + error.message
                );
            }
        );
    }

    function randomRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const bytes = new Uint8Array(12);

        crypto.getRandomValues(bytes);

        return Array.from(
            bytes,
            byte => chars[byte % chars.length]
        ).join("");
    }

    /* =========================================
       INIZIALIZZAZIONE FIREBASE
    ========================================= */

    async function initializeFirebase() {

        if (
            !window.firebase ||
            typeof firebaseConfig === "undefined" ||
            !firebaseConfig.apiKey ||
            !firebaseConfig.databaseURL
        ) {
            updateStatus(
                "Modalità locale: configura Firebase per collegare i telefoni."
            );
            return;
        }

        try {

            // Inizializza Firebase una sola volta.
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }

            // Autenticazione anonima.
            const auth = firebase.auth();

            if (!auth.currentUser) {
                await auth.signInAnonymously();
            }

            // Connessione Realtime Database.
            db = firebase.database();

            updateStatus("Connesso a Firebase.");

            if (projectionMode) {

                const params = new URLSearchParams(location.search);
                const id = params.get("room");

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

            console.error("Errore inizializzazione Firebase:", error);

            db = null;

            updateStatus(
                "Connessione non disponibile: " + error.message
            );
        }
    }

    /* =========================================
       MESSAGGI SALVATI
    ========================================= */

    function saveMessages() {
        const data = loadLocal();

        data.messages = messages;

        localStorage.setItem(
            KEY,
            JSON.stringify(data)
        );
    }

    function renderMessages() {
        const list = $("savedList");

        if (!list) return;

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
            remove.setAttribute(
                "aria-label",
                "Elimina messaggio"
            );

            remove.onclick = () => {
                messages.splice(index, 1);

                saveMessages();
                renderMessages();
            };

            item.append(select, remove);
            list.appendChild(item);
        });
    }

    /* =========================================
       EVENTI DELLA REGIA
    ========================================= */

    function initializeController() {

        messages = loadLocal().messages || [];

        $("messageInput")?.addEventListener("input", sendUpdate);

        $("fontSize")?.addEventListener("input", sendUpdate);

        $("scrollToggle")?.addEventListener("change", sendUpdate);

        document.querySelectorAll(".color").forEach(button => {

            button.addEventListener("click", () => {

                document.querySelectorAll(".color").forEach(b => {
                    b.classList.remove("active");
                });

                button.classList.add("active");

                $("screen").style.backgroundColor =
                    button.dataset.color;

                sendUpdate();
            });
        });

        $("clearBtn")?.addEventListener("click", () => {
            $("messageInput").value = "";
            sendUpdate();
        });

        $("saveBtn")?.addEventListener("click", () => {

            const text = $("messageInput").value.trim();

            if (!text) {
                alert("Scrivi prima un messaggio!");
                return;
            }

            if (messages.includes(text)) {
                alert("Messaggio già salvato!");
                return;
            }

            messages.unshift(text);

            saveMessages();
            renderMessages();
        });

        /* CREAZIONE STANZA */

        $("createRoom")?.addEventListener("click", async () => {

            if (!db) {
                alert(
                    "Firebase non è disponibile. Controlla la configurazione e la connessione."
                );
                return;
            }

            const button = $("createRoom");

            button.disabled = true;

            try {

                const id = randomRoomCode();

                const ref = db.ref("rooms/" + id);

                await ref.child("state").set(getState());

                subscribeRoom(id);

                updateStatus("Stanza creata: " + id);

            } catch (error) {

                console.error("Errore creazione stanza:", error);

                alert(
                    "Impossibile creare la stanza: " + error.message
                );

            } finally {
                button.disabled = false;
            }
        });

        /* COLLEGAMENTO A STANZA ESISTENTE */

        $("joinRoom")?.addEventListener("click", () => {

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
        });

        /* COPIA CODICE */

        $("copyCode")?.addEventListener("click", async () => {

            if (!roomId) return;

            try {
                await navigator.clipboard.writeText(roomId);
                updateStatus("Codice copiato!");
            } catch (error) {
                updateStatus("Codice stanza: " + roomId);
            }
        });

        /* COPIA LINK PROIEZIONE */

        $("copyLink")?.addEventListener("click", async () => {

            if (!roomId) return;

            const url = new URL("projection.html", location.href);

            url.searchParams.set("room", roomId);

            try {
                await navigator.clipboard.writeText(url.href);
                updateStatus("Link di proiezione copiato!");
            } catch (error) {
                updateStatus("Link: " + url.href);
            }
        });

        /* APERTURA PROIEZIONE */

        $("showBtn")?.addEventListener("click", () => {

            const url = new URL("projection.html", location.href);

            if (roomId) {
                url.searchParams.set("room", roomId);
            }

            window.open(
                url.href,
                "messageProjection"
            );
        });

        /* STATO INIZIALE */

        applyState(loadLocal());
        renderMessages();
    }

    /* =========================================
       EVENTI DELLA PROIEZIONE
    ========================================= */

    function initializeProjection() {

        applyState(loadLocal());

        $("exitBtn")?.addEventListener("click", () => {

            if (document.fullscreenElement) {
                document.exitFullscreen()?.catch(() => {});
            }

            window.close();
        });

        $("screen")?.addEventListener("dblclick", () => {

            if (!document.fullscreenElement) {
                document.documentElement
                    .requestFullscreen?.()
                    .catch(() => {});
            }
        });
    }

    /* =========================================
       EVENTI DI RETE
    ========================================= */

    window.addEventListener("online", () => {
        updateStatus("Connessione Internet ripristinata.");

        if (!projectionMode && db && roomId) {
            sendUpdate();
        }
    });

    window.addEventListener("offline", () => {
        updateStatus("Offline: sincronizzazione sospesa.");
    });

    /* =========================================
       AVVIO APPLICAZIONE
    ========================================= */

    if (projectionMode) {
        initializeProjection();
    } else {
        initializeController();
    }

    initializeFirebase();

})();
