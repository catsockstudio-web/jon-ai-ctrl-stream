' Launch the Nightwire tray app with no console window.
'
' Double-clicking a .ps1 opens it in Notepad rather than running it, and
' running one from a shortcut flashes a console. This is the one entry point
' the Start Menu shortcut, the Startup shortcut and the desktop icon all use,
' so there is a single way in however it was launched.
Option Explicit
Dim shell, fso, repo, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
repo = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = repo

' -ExecutionPolicy Bypass so the script runs on a machine whose policy is the
' Windows default (Restricted), without asking the customer to change a
' system-wide security setting for one overlay.
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ _
      & repo & "\Nightwire.ps1"""

' 0 = hidden window, False = do not wait for it to exit.
shell.Run cmd, 0, False
