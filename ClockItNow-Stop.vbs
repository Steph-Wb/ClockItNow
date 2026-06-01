' ClockItNow – beendet alle laufenden Server-Instanzen

Dim oShell
Set oShell = CreateObject("WScript.Shell")

' node.exe beenden (Express + tsx watch)
oShell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True

' Kurz warten
WScript.Sleep 500

' Prüfen ob Ports noch belegt sind
Dim result
result = oShell.Run("cmd /c netstat -ano | findstr "":3001 "" | findstr ""ABHOEREN"" >nul 2>&1", 0, True)

If result = 0 Then
    MsgBox "ClockItNow konnte nicht vollständig beendet werden." & vbCrLf & _
           "Bitte node.exe manuell im Task-Manager beenden.", vbExclamation, "ClockItNow Stop"
End If
