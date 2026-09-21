# Kick OBS Timer

Prosty timer do OBS sterowany komendami z czatu Kick.

Timer reaguje tylko na wiadomości strimera i moderatorów.

## Komendy

Uruchamia timer na 5 minut.
```text
!timer 5
```

Zatrzymuje odliczanie i ukrywa timer.

```text
!timer stop
!timer reset
```

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

Pozostałe ustawienia:
``` text
channel – nazwa kanału Kick, np. "Eddie".
command – komenda uruchamiająca timer. Domyślnie !timer.
minMinutes – minimalna liczba minut, jaką można ustawić komendą.
maxMinutes – maksymalna liczba minut, jaką można ustawić komendą.
debug – true włącza dodatkowe logi w konsoli Browser Source, false je wyłącza.
```
## Wersja on-line

Skorzystaj z hostowanej wersji na github, w OBS ustaw ten adres jako Browser Source.

```text
https://seba11.github.io/kick-obs-timer/?channel=twojkanal
```
w miejsce `twojkanal` wpisz nazwę swojego kanału.


Zalecany rozmiar:

```text
Width: 800
Height: 300
