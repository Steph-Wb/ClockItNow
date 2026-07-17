/**
 * Löst einen Datei-Download aus einem Blob aus.
 *
 * Wichtig: Die Object-URL erst mit Verzögerung widerrufen, nicht direkt nach
 * `.click()`. In Electron läuft der native "Speichern unter"-Dialog asynchron
 * über den Hauptprozess – wird sofort widerrufen, ist der Blob-Inhalt beim
 * tatsächlichen Speichern schon weg ("Datei wurde nicht gefunden").
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
