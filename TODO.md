# ToDo – Offene Punkte aus dem Code-Review (2026-07-01)

Bereits umgesetzt (nicht mehr offen):
- ✅ Async-Error-Handling: `asyncHandler`-Wrapper + zentraler Error-Handler in `server/index.ts`, JWT_SECRET-Check beim Start (Absturz durch unhandled rejection behoben)
- ✅ `billed_at` wird erst **nach** erfolgreicher Rapport-Erzeugung gesetzt, atomar in einem einzigen UPDATE; `from`/`to` werden validiert; Dateiname wird für den HTTP-Header bereinigt

---

## ~~1. CSV-Import: Parser ohne Quote-Handling~~ ✅ erledigt
`parseClockifyCSV` nutzt jetzt einen RFC-4180-Tokenizer (Semikolons, Zeilenumbrüche und `""`-Escapes in gequoteten Feldern) plus Plausibilitätsprüfung „Endzeit ≥ Startzeit“ pro Zeile.

## ~~2. Import nicht atomar; Retry erzeugt Duplikate~~ ✅ erledigt
Neuer Endpoint `POST /api/time-entries/import`: validiert erst alle Zeilen, schreibt dann in einer Transaktion (alles oder nichts) und prüft Duplikate serverseitig (auch innerhalb des Batches). `ImportModal` schickt einen einzigen Bulk-Request statt einer POST-Schleife.

## ~~3. Keine Validierung von start_time/end_time~~ ✅ erledigt
POST/PUT validieren jetzt beide Zeitstempel (`Date.parse`), lehnen `end < start` mit 400 ab und normalisieren auf UTC-ISO. Neue Fehler-Keys: `errors.timeEntries.invalidTimestamp` / `endBeforeStart`.

## ~~4. Doppelte/verwaiste laufende Timer~~ ✅ erledigt
Ein neuer offener Eintrag (POST ohne `end_time`) schließt vorhandene offene Einträge des Users automatisch (heilt auch Alt-Waisen); `/active` wählt deterministisch per `ORDER BY start_time DESC`; `useTimer` hat einen Doppelklick-Guard für Start und Stop.

## ~~5. from/to-Validierung in Dashboard & Reports~~ ✅ erledigt
Zentraler Helper `parseDateKey` in `server/lib/timezone.ts` (Format + echtes Kalenderdatum); Dashboard, Reports und Arbeitsrapport lehnen ungültige `from`/`to` mit 400 `errors.invalidDateRange` ab.

## ~~6. CLI-Rapport filtert Monat anders als App-Endpoint~~ ✅ erledigt
`scripts/arbeitsrapport.ts` nutzt jetzt `utcWindowForLocalRange` + `localDateKey`-Filter in der User-Zeitzone (identisch zur Route), Erstellungsdatum ebenfalls in User-TZ; Monat wird auf 01–12 validiert.

## ~~7. Rundungsregel pro Kunde~~ ✅ erledigt
Pro Kunde konfigurierbar (Raster 5/10/15 Min, Auf-/Abrunden; Default 15/Aufrunden). Umsetzung als Largest-Remainder-Verfahren in `server/lib/rounding.ts`: jede Tageszeile wird nach der Regel gerundet; überschreitet die gerundete Gesamtsumme die exakte um mehr als ein Raster, wird die Zeile mit dem größten Rundungsgewinn auf Abrunden zurückgestuft (deterministisch, terminiert garantiert). Beim Aufrunden verschwinden zudem keine Kurzeinsätze mehr als `0.00`.

## 8. Magic-Link-Token per Race zweimal einlösbar (RISIKO – Datenkonsistenz)
**Datei:** `server/routes/auth.ts` (`/magic-link/verify`, außerdem `/register`)
Check (`used_at IS NULL`) und Markierung sind getrennte Statements → zwei parallele Requests bekommen beide eine Session. `/register` hat dasselbe Check-then-Act-Muster (Existenz-Check → Insert → 4 Orphan-UPDATEs ohne Transaktion).
**Fix (verify):** `UPDATE magic_links SET used_at = datetime('now') WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')` und `changes === 0` → 400.
**Fix (register):** Check + Insert + Zuweisungs-UPDATEs in eine Transaktion (`BEGIN`/`COMMIT`/`ROLLBACK`).

## ~~9. Arbeitsrapport-Download verändert Zustand auf GET~~ ✅ erledigt
Der GET-Download ist jetzt frei von Seiteneffekten; das Markieren übernimmt der neue Bestätigungs-Endpoint `POST /api/arbeitsrapport/mark-billed` (gleiche Filter wie der Download), den das Frontend erst nach vollständigem Blob-Empfang aufruft.
