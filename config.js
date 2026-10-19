window.KICK_TIMER_CONFIG = {
  // Nazwa kanału Kick, bez https://kick.com/
  channel: "",

  // Komenda na czacie:
  // !timer 5
  command: "!timer",

  // Bezpieczne ograniczenia wartości z czatu.
  minMinutes: 1,
  maxMinutes: 240,

  // Proxy realtime wymagane przy hostowaniu poza kick.com (np. GitHub Pages).
  // Wstaw adres wdrożonego Cloudflare Workera, np.:
  // realtimeProxy: "https://kick-obs-timer-proxy.example.workers.dev",
  realtimeProxy: "",

  // Dźwięk do odtworzenia na koniec timera.
  sound: "sound/alarm-classic.mp3",

  // true = dodatkowe logi w konsoli OBS Browser Source.
  debug: true
};
