' Start Nightwire: the overlay server first, then the tray icon.
'
' The order matters, and it is the whole point of this file. An earlier
' version launched only the tray and let the tray start the server — so when
' PowerShell could not run the tray script (an execution policy set by group
' policy overrides -ExecutionPolicy Bypass, and some machines have one) the
' server never started either, the dashboard refused connections, and there
' was no log to say why. A control surface must never be able to take the
' thing it controls down with it.
'
' So: the server is started here, the proven way, with its output going to
' server.log. The tray is then launched separately and adopts whatever is
' already running. If the tray fails, the overlay is still up and every .bat
' in the folder still works.
Option Explicit
Dim shell, fso, repo, running, http

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = repo

' Is one already serving? Starting a second is harmless — it exits saying the
' port is taken — but it would overwrite server.log with that message and
' throw away whatever the running one had recorded.
running = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", "http://127.0.0.1:8787/api/health", False
http.Send
If Err.Number = 0 Then
  If http.Status = 200 Then running = True
End If
Err.Clear
On Error GoTo 0

If Not running Then
  ' 0 = hidden window, False = do not wait. Redirection is done by cmd rather
  ' than captured here: a server that runs all stream keeps writing, and a
  ' pipe nobody drains eventually blocks the process it belongs to.
  shell.Run "cmd /c node server.mjs > server.log 2>&1", 0, False
End If

' The tray is best-effort. Anything that goes wrong from here leaves a working
' overlay behind, which is the only guarantee that actually matters.
On Error Resume Next
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ _
          & repo & "\Nightwire.ps1""", 0, False
On Error GoTo 0
