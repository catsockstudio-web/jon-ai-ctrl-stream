' Launch the JON_AI_CTRL overlay server with no console window.
' Used by the Startup shortcut that install-autostart.bat creates.
' Output goes to server.log next to this file, overwritten each start.
Option Explicit
Dim shell, fso, repo
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = repo
' 0 = hidden window, False = do not wait for it to exit.
shell.Run "cmd /c node server.mjs > server.log 2>&1", 0, False
