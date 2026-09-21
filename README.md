# Kick OBS Timer

Prosty timer do OBS sterowany komendami z czatu Kick.

Timer reaguje tylko na wiadomości strimera i moderatorów.

## Komendy

```text
!timer 5
```

Uruchamia timer na 5 minut.

```text
!timer 10
```

Resetuje aktualny timer i rozpoczyna odliczanie od 10 minut.

```text
!timer stop
!timer reset
```

Zatrzymuje odliczanie i ukrywa timer.

## Użycie lokalne

Pobierz repozytorium i ustaw nazwę kanału w `config.js`:

```js
window.KICK_TIMER_CONFIG = {
  channel: "twojkanal",
  command: "!timer",
  minMinutes: 1,
  maxMinutes: 240,
  debug: true
};
```

Następnie dodaj `index.html` jako Browser Source w OBS.

Zalecany rozmiar widzętu w OBS:

```text
Width: 800
Height: 300
```
