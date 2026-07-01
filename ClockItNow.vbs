' ClockItNow – startet Server und Frontend komplett im Hintergrund (kein sichtbares Fenster)

Dim oShell, scriptDir
Set oShell = CreateObject("WScript.Shell")

' Beim Autostart: kurz warten bis Windows vollständig geladen ist
WScript.Sleep 4000

' Verzeichnis dieses Scripts
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' Bestehende Instanzen beenden (Fensterstil 0 = unsichtbar, True = warten bis fertig)
oShell.Run "cmd /c """ & scriptDir & "clockitnow-start.cmd""", 0, False
