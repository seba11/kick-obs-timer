const KICK_REALTIME_BASE = "https://web.kick.com/api/v1/realtime";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function isAllowedRealtimePath(path) {
  return (
    path === "/auth/connection" ||
    /^\/channels\/\d+\/chat\/connection$/.test(path)
  );
}

function parseAllowedWebSocketTarget(value) {
  if (!value) return null;

  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "wss:" ||
    !/^realtime\.[a-z0-9-]+\.platform\.kick\.com$/i.test(url.hostname) ||
    url.pathname !== "/connection/websocket" ||
    url.username ||
    url.password
  ) {
    return null;
  }

  return url;
}

async function proxyRealtimeHttp(request, url) {
  const path = url.searchParams.get("path");

  if (!isAllowedRealtimePath(path)) {
    return new Response("Invalid realtime path", { status: 400 });
  }

  const body = await request.text();

  const upstream = await fetch(`${KICK_REALTIME_BASE}${path}`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Origin": "https://kick.com",
      "Referer": "https://kick.com/",
      "x-app-platform": "web"
    },
    body
  });

  const headers = new Headers(corsHeaders(request));
  const contentType = upstream.headers.get("Content-Type");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
}

async function proxyWebSocket(request, url) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const target = parseAllowedWebSocketTarget(url.searchParams.get("url"));

  if (!target) {
    return new Response("Invalid WebSocket target", { status: 400 });
  }

  const upstreamUrl = new URL(target);
  upstreamUrl.protocol = "https:";

  const headers = new Headers();
  headers.set("Upgrade", "websocket");
  headers.set("Origin", "https://kick.com");
  headers.set("Referer", "https://kick.com/");

  const upstream = await fetch(upstreamUrl.toString(), { headers });

  if (!upstream.webSocket) {
    return new Response("Kick rejected WebSocket connection", {
      status: upstream.status || 502
    });
  }

  return new Response(null, {
    status: 101,
    webSocket: upstream.webSocket
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    if (url.pathname === "/realtime" && request.method === "POST") {
      return proxyRealtimeHttp(request, url);
    }

    if (url.pathname === "/ws") {
      return proxyWebSocket(request, url);
    }

    return new Response("Kick OBS Timer realtime proxy", { status: 200 });
  }
};
