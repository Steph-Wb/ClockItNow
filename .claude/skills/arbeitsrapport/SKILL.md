---
name: arbeitsrapport
description: Erstellt einen monatlichen Arbeitsrapport (.xlsx) für einen Kunden aus den ClockItNow-Zeiteinträgen. Trigger, wenn der Nutzer einen Arbeitsrapport / Monatsrapport / Stundenrapport für einen Kunden und Monat erzeugen will.
---

# Arbeitsrapport erstellen

Erzeugt eine Excel-Datei (`.xlsx`) im Format des Monats-Arbeitsrapports: Absenderkopf,
Kunden-Block, Rapport-Nr. (`YYYY-MM`), Projekt-Beschreibung, Tabelle der ausgeführten Arbeiten
(pro Tag eine Zeile: Datum · Dauer · Tätigkeit · kumulierte Summe), Total und Unterschriftsblock
mit eingebetteter Unterschrift-Grafik.

Daten stammen aus der lokalen ClockItNow-Datenbank (`clockitnow.db`). Absenderangaben und
Unterschrift kommen aus den **Einstellungen** der App (Tabelle `app_settings`). Kundenadresse
kommt aus dem Kundenstamm.

## Ablauf

1. Kläre **Monat** (`YYYY-MM`) und **Kunde** (Name) aus der Nutzeranfrage. Optional: eine
   **Projekt-/Beschreibungszeile** (z. B. `Diverse Aufträge gemäss der Liste "abas support daily"`).
2. Führe das CLI-Skript im ClockItNow-Projektordner aus:

   ```
   npx tsx scripts/arbeitsrapport.ts --month <YYYY-MM> --client "<Kundenname>" \
       [--projekt "<Beschreibung>"] [--out "<Zielordner-oder-Datei>"]
   ```

   - Ohne `--out` wird die Datei im aktuellen Verzeichnis abgelegt.
   - `--out` kann ein Ordner sein (Dateiname wird automatisch gesetzt) oder ein voller Pfad.
3. Melde den erzeugten Dateipfad und die Anzahl der berücksichtigten Einträge zurück.

## Hinweise

- Der App-Button auf der **Berichte**-Seite nutzt denselben Builder
  (`server/lib/buildArbeitsrapport.ts`) – Skript und App liefern identische Dateien.
- Dauer wird pro Tag summiert und auf 0.25-Stunden-Schritte gerundet.
- Fehlt die Unterschrift in den Einstellungen, bleibt nur die Unterschriftslinie.
- Voraussetzung: `npm install` wurde ausgeführt (Abhängigkeit `exceljs`, `tsx`).
