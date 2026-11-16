# Riss-Alarm

Mixed-Reality-Spiel für Meta Quest (WebXR, Passthrough, Raumerkennung). Läuft direkt im Quest-Browser, keine Installation.

**Spielen:** Seite im Quest-Browser öffnen → „AR STARTEN“ → Zugriff auf Raumdaten erlauben.

- Kristallwesen brechen durch die echten Wände (aus der Raumeinrichtung der Quest).
- Rechte Hand Blaster: Schüsse prallen an echten Wänden/Boden ab (Bandenschuss = Punktebonus).
- Linke Hand Schild: pariert Geschosse und lenkt sie auf Gegner.
- Risse anschießen versiegelt sie. Krabbler per Schlag erledigen. Herzen erscheinen auf Tischen/Sofa.
- Alle 5 Wellen ein Boss. Griff-Taste tauscht die Hände. B oder Y 1 s halten beendet das Spiel.

Ohne Raumeinrichtung nutzt das Spiel einen virtuellen 5×5-m-Raum.
Technik: three.js r160 (lokal in `vendor/`), keine Build-Schritte.

---

# Günther muss mal (`guenther/`)

Zweites Spiel im selben Repo: Mixed-Reality-Jump-and-Run. Günther (15 cm, drei Bier intus) muss aufs goldene Klo,
das oben auf deinen echten Möbeln oder auf Wandbrettern an deinen echten Wänden steht. Du baust ihm mit
schwebenden Klopapierrollen und Furzkissen den Weg. Derber Humor, ab 16.

**Spielen:** `https://klaus1312trophobie.github.io/quest-ar/guenther/` im Quest-Browser → „AR STARTEN“.
Am PC ohne Brille: Knopf „Am PC ausprobieren“ (oder `?desk` anhängen).

- Linker Stick: laufen · A/X: springen · linker Abzug: auf Stelle zeigen, Günther läuft hin · linke Griff-Taste: zurück zum Checkpoint
- Rechter Abzug: Klorolle an die Controllerspitze · rechte Griff-Taste: Furzkissen · B: wegnehmen · Y 1 s halten: beenden
- Blase füllt sich mit der Zeit (und mit jedem Bier). Level 3+: Boden ist Lava, Level 4+: Saugroboter (frisst Günther, ist aber auch ein Taxi).
