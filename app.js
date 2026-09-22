(() => {
  "use strict";

  const CONFIG = window.KICK_TIMER_CONFIG || {};
  
  const urlParams = new URLSearchParams(window.location.search);
  const channelFromUrl = urlParams.get("channel");

  if (channelFromUrl) {
	CONFIG.channel = channelFromUrl;
	}

  const timerEndSound = CONFIG.sound ? new Audio(CONFIG.sound) : null;
  if (timerEndSound) {
    timerEndSound.preload = "auto";
  }
  const PusherAppKey = "32cbd69e4b950bf97679";
  const PusherCluster = "us2";

  const timerEl = document.getElementById("timer");
  const timerMessageEl = document.getElementById("timerMessage");
  const timerTextEl = document.getElementById("timerText");

  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let currentChatroomId = null;
  let broadcasterUsername = null;

  let timerInterval = null;
  let timerEndsAt = null;

  const log = (...args) => {
    if (CONFIG.debug) {
      console.log("[KickTimer]", ...args);
    }
  };

  const warn = (...args) => console.warn("[KickTimer]", ...args);
  const error = (...args) => console.error("[KickTimer]", ...args);

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.ceil(totalSeconds));

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
      ].join(":");
    }

    return [
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0")
    ].join(":");
  }

  function hideTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    timerEndsAt = null;
    timerMessageEl.textContent = "";
    timerMessageEl.classList.add("hidden");
    timerEl.classList.add("hidden");
  }

  function renderTimer() {
    if (!timerEndsAt) {
      hideTimer();
      return;
    }

    const remainingMs = timerEndsAt - Date.now();

    if (remainingMs <= 0) {
      timerTextEl.textContent = "00:00";

      if (timerEndSound) {
        timerEndSound.currentTime = 0;

        timerEndSound.play().catch(err => {
          warn("Unable to play timer sound:", err);
        });
      }

      hideTimer();
      log("Timer finished");
      return;
    }

    timerTextEl.textContent = formatTime(remainingMs / 1000);
  }

  function startTimer(minutes, message = "") {
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    timerEndsAt = Date.now() + minutes * 60 * 1000;

    if (message) {
      timerMessageEl.textContent = message;
      timerMessageEl.classList.remove("hidden");
    } else {
      timerMessageEl.textContent = "";
      timerMessageEl.classList.add("hidden");
    }

    timerEl.classList.remove("hidden");
    renderTimer();

    timerInterval = setInterval(renderTimer, 250);

    log(`Timer started/reset: ${minutes} minute(s)`);
  }

  function parseTimerCommand(text) {
    const command = String(CONFIG.command || "!timer").trim();
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = String(text || "").trim();

    // Akceptowane:
    // !timer 5
    // !timer stop
    // !timer reset
    const actionMatch = value.match(
      new RegExp(`^${escaped}\\s+(stop|reset)$`, "i")
    );

    if (actionMatch) {
      return {
        type: actionMatch[1].toLowerCase()
      };
    }

    const timeMatch = value.match(
      new RegExp(`^${escaped}\\s+(\\d+)(?:\\s+(.+))?$`, "i")
    );

    if (!timeMatch) {
      return null;
    }

    const minutes = Number.parseInt(timeMatch[1], 10);

    if (!Number.isInteger(minutes)) {
      return null;
    }

    const min = Number.isInteger(CONFIG.minMinutes) ? CONFIG.minMinutes : 1;
    const max = Number.isInteger(CONFIG.maxMinutes) ? CONFIG.maxMinutes : 240;

    if (minutes < min || minutes > max) {
      warn(`Ignored timer value outside range ${min}-${max}:`, minutes);
      return null;
    }

    return {
      type: "start",
      minutes,
      message: timeMatch[2] ? timeMatch[2].trim().slice(0, 100) : ""
    };
  }

  function extractMessage(payload) {
    /*
      Kick zmieniał format eventów w czasie.
      Obsługujemy zarówno nowszy payload:
        { sender, content }
      jak i starszy:
        { user, message: { message: "..." } }
    */

    const sender =
      payload?.sender ||
      payload?.user ||
      payload?.data?.sender ||
      payload?.data?.user ||
      {};

    const messageObj =
      payload?.message && typeof payload.message === "object"
        ? payload.message
        : payload?.data?.message && typeof payload.data.message === "object"
          ? payload.data.message
          : {};

    const text =
      payload?.content ??
      payload?.message?.content ??
      payload?.message?.message ??
      payload?.data?.content ??
      payload?.data?.message?.content ??
      payload?.data?.message?.message ??
      "";

    return {
      text: String(text || ""),
      sender
    };
  }

  function collectRoleStrings(sender) {
    const values = [];

    const candidates = [
      sender?.role,
      sender?.identity?.role,
      sender?.user_role,
      sender?.type
    ];

    for (const value of candidates) {
      if (typeof value === "string") {
        values.push(value.toLowerCase());
      }
    }

    const badgeContainers = [
      sender?.badges,
      sender?.identity?.badges,
      sender?.channel_identity?.badges
    ];

    for (const badges of badgeContainers) {
      if (!Array.isArray(badges)) continue;

      for (const badge of badges) {
        if (typeof badge === "string") {
          values.push(badge.toLowerCase());
          continue;
        }

        if (badge && typeof badge === "object") {
          for (const key of ["type", "name", "text", "slug"]) {
            if (typeof badge[key] === "string") {
              values.push(badge[key].toLowerCase());
            }
          }
        }
      }
    }

    return values;
  }

  function isModerator(sender) {
    const roles = collectRoleStrings(sender);

    return roles.some(role =>
      role === "moderator" ||
      role === "mod" ||
      role.includes("moderator")
    );
  }

  function isBroadcaster(sender) {
    const senderUsername = normalizeUsername(
      sender?.username ||
      sender?.slug ||
      sender?.name
    );

    if (
      senderUsername &&
      broadcasterUsername &&
      senderUsername === broadcasterUsername
    ) {
      return true;
    }

    const roles = collectRoleStrings(sender);

    return roles.some(role =>
      role === "broadcaster" ||
      role === "owner" ||
      role === "channel_owner" ||
      role.includes("broadcaster")
    );
  }

  function isAllowedSender(sender) {
    return isBroadcaster(sender) || isModerator(sender);
  }

  function handleChatPayload(payload) {
    const { text, sender } = extractMessage(payload);

    if (!text) return;

    const command = parseTimerCommand(text);

    if (command === null) {
      return;
    }

    const username =
      sender?.username ||
      sender?.slug ||
      sender?.name ||
      "unknown";

    if (!isAllowedSender(sender)) {
      log(`Ignored command from non-mod user: ${username}`);
      return;
    }

    log(`Accepted command from ${username}: ${text}`);

    if (command.type === "start") {
      startTimer(command.minutes, command.message);
      return;
    }

    if (command.type === "stop" || command.type === "reset") {
      hideTimer();
      log(`Timer ${command.type}`);
    }
  }

  function safeJsonParse(value) {
    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  function handleSocketMessage(event) {
    let packet;

    try {
      packet = JSON.parse(event.data);
    } catch {
      return;
    }

    if (packet.event === "pusher:ping") {
      socket?.send(JSON.stringify({
        event: "pusher:pong",
        data: {}
      }));
      return;
    }

    if (packet.event === "pusher:connection_established") {
      log("Pusher connection established");

      socket.send(JSON.stringify({
        event: "pusher:subscribe",
        data: {
          auth: "",
          channel: `chatrooms.${currentChatroomId}.v2`
        }
      }));

      return;
    }

    if (packet.event === "pusher_internal:subscription_succeeded") {
      reconnectAttempts = 0;
      log(`Subscribed to chatrooms.${currentChatroomId}.v2`);
      return;
    }

    const eventName = String(packet.event || "").toLowerCase();

    if (
      eventName.includes("chatmessage") ||
      eventName.includes("chat_message") ||
      eventName.includes("messagesent")
    ) {
      const payload = safeJsonParse(packet.data);
      handleChatPayload(payload);
    }
  }

  function buildWsUrl() {
    const params = new URLSearchParams({
      protocol: "7",
      client: "js",
      version: "8.4.0",
      flash: "false"
    });

    return `wss://ws-${PusherCluster}.pusher.com/app/${PusherAppKey}?${params}`;
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);

    reconnectAttempts += 1;

    // max ~30 s
    const delay = Math.min(30000, 2000 * reconnectAttempts);

    warn(`Disconnected. Reconnect in ${Math.round(delay / 1000)}s`);

    reconnectTimer = setTimeout(() => {
      connectWebSocket();
    }, delay);
  }

  function connectWebSocket() {
    if (!currentChatroomId) {
      error("Missing chatroom ID");
      return;
    }

    if (
      socket &&
      (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      )
    ) {
      return;
    }

    socket = new WebSocket(buildWsUrl());

    socket.addEventListener("open", () => {
      log("WebSocket opened");
    });

    socket.addEventListener("message", handleSocketMessage);

    socket.addEventListener("error", event => {
      error("WebSocket error", event);
    });

    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
    });
  }

  async function fetchChannelData(channel) {
    const urls = [
      `https://kick.com/api/v1/channels/${encodeURIComponent(channel)}`,
      `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`
    ];

    let lastError = null;

    for (const url of urls) {
      try {
        log("Resolving channel:", url);

        const response = await fetch(url, {
          method: "GET",
          cache: "no-store",
          credentials: "omit",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        warn(`Failed to resolve through ${url}:`, err);
      }
    }

    throw lastError || new Error("Unable to resolve Kick channel");
  }

  async function init() {
    const channel = normalizeUsername(CONFIG.channel);

    if (!channel || channel === "twojkanal") {
      error("Set channel in config.js");
      return;
    }

    try {
      const data = await fetchChannelData(channel);

      currentChatroomId =
        data?.chatroom?.id ||
        data?.chatroom_id ||
        data?.channel?.chatroom?.id;

      broadcasterUsername = normalizeUsername(
        data?.slug ||
        data?.user?.username ||
        data?.user?.slug ||
        channel
      );

      if (!currentChatroomId) {
        throw new Error("Kick API did not return chatroom.id");
      }

      log("Channel resolved", {
        channel: broadcasterUsername,
        chatroomId: currentChatroomId
      });

      connectWebSocket();
    } catch (err) {
      error("Initialization failed:", err);

      // Ponawiamy inicjalizację, ponieważ Cloudflare/API Kick może chwilowo
      // odmówić odpowiedzi w OBS Browser Source.
      setTimeout(init, 15000);
    }
  }

  window.addEventListener("beforeunload", () => {
    clearTimeout(reconnectTimer);

    if (timerInterval) {
      clearInterval(timerInterval);
    }

    if (socket) {
      socket.close();
    }
  });

  init();
})();
