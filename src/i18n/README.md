# i18n-Architektur (DE / EN)

Verbindliche Spezifikation für die Mehrsprachigkeit von ClockItNow.
**Alle Folge-Tasks (#2–#8) richten sich nach diesem Dokument.**

Bibliothek: `i18next` + `react-i18next`.

---

## Entscheid 1 — Eine Namespace-Datei pro Sprache, verschachtelte Gruppen

Kein Multi-Namespace-Splitting (kein Lazy-Loading nötig bei ~250 Strings).
Je eine Datei: `locales/de.json`, `locales/en.json`. Top-Level-Gruppen nach Feature:

| Gruppe | Inhalt |
|---|---|
| `nav` | Sidebar-Labels |
| `common` | Geteilte Buttons & generische Wörter (save, cancel, delete, add, …) |
| `auth` | Login/Registrierung/Magic-Link UI |
| `timer` | Tracker-Seite, TimerBar, TimeEntryList |
| `dashboard` | KPI-Cards, Charts |
| `clients` | Kunden-Seite + Modal |
| `projects` | Projekte-Seite + Modal |
| `reports` | Berichte-Seite, Filter, CSV/Druck |
| `arbeitsrapport` | Arbeitsrapport-Modal **und** xlsx-Labels (`arbeitsrapport.xlsx.*`) |
| `settings` | Einstellungen-Seite |
| `import` | Clockify-Import-Modal |
| `errors` | Backend-Fehler-Keys **und** Frontend-Validierung |

## Entscheid 2 — Key-Konvention

- **camelCase**, gruppiert: `t('reports.exportCsv')`, `t('common.save')`.
- Interpolation mit `{{var}}`: `"weekLabel": "KW {{week}} · {{from}} – {{to}}"` → `t('reports.weekLabel', { week, from, to })`.
- Keine ganzen Sätze als Key; Key beschreibt die Funktion, nicht den Text.

## Entscheid 3 — Backend gibt Fehler-**Keys** zurück, Frontend übersetzt

Backend antwortet mit i18n-Key statt Klartext:

```ts
// vorher: res.status(401).json({ error: 'Ungültige Zugangsdaten' })
res.status(401).json({ error: 'errors.auth.invalidCredentials' })
```

Frontend (`src/api/index.ts`) wirft weiterhin `new Error(err.error)` — die Message **ist** nun der Key.
Anzeigestellen (ErrorBanner, LoginPage-catch usw.) übersetzen mit `t(message)`.
i18next gibt bei unbekanntem Key den Key selbst zurück → Alt-/Fremdstrings brechen nichts (sicherer Fallback).

**Helper im Frontend:** kleine Funktion `translateError(t, message)` die `t(message)` zurückgibt, falls `message` mit `errors.` beginnt, sonst `message` unverändert (für Netzwerkfehler etc.).

Backend-Sprache wird damit **eliminiert** (keine DE/EN-Inkonsistenz mehr) — der Server transportiert nur noch Keys.

## Entscheid 4 — xlsx-Builder: eigene Label-Map serverseitig

`server/lib/buildArbeitsrapport.ts` läuft serverseitig ohne React. Daher **kein** Import aus `src/i18n`.
Stattdessen: kleine, eigenständige Label-Map im Builder, per `lang: 'de' | 'en'` Parameter gewählt.
Die Route (`/api/arbeitsrapport`) und die CLI (`scripts/arbeitsrapport.ts`) reichen `lang` durch
(Default `'de'`; im App-Aufruf aus der aktiven UI-Sprache, in der CLI per `--lang`).

xlsx-Labels (Spiegel zu `arbeitsrapport.xlsx.*`, aber serverseitig dupliziert):
`Arbeitsrapport`/`Work Report`, `Kunde`/`Client`, `Rapport-Nr.`, `Datum`/`Date`, `Projekt`/`Project`,
`Ausgeführte Arbeiten`/`Work performed`, `Datum`/`Date`, `Dauer`/`Duration`, `Tätigkeit`/`Activity`,
`Dauer sum.`/`Duration sum.`, `Zwischentotal`/`Subtotal`, `Total Arbeiten`/`Total`,
`Datum / Unterschrift`/`Date / Signature`.

## Entscheid 5 — Standardsprache & Erkennung

- `lng`: aus `localStorage['clockitnow_lang']`, sonst **`'de'`**.
- `fallbackLng`: **`'de'`** (fehlende EN-Keys zeigen Deutsch statt Roh-Key).
- Sprachwechsel persistiert in `localStorage`; `<html lang>` wird mitgesetzt.

---

## Hand-off an Folge-Tasks

- **#2** baut `config.ts` exakt nach Entscheid 5; Sprachumschalter in Einstellungen.
- **#3** füllt `de.json`/`en.json` nach der Gruppen-Struktur (Skelett liegt bereits vor).
- **#4** ersetzt UI-Strings durch `t('gruppe.key')`; nutzt `translateError` an Fehler-Anzeigestellen.
- **#6** stellt Backend auf `errors.*`-Keys um (Mapping siehe `errors` in den JSON-Dateien).
- **#7** implementiert die xlsx-Label-Map nach Entscheid 4.
