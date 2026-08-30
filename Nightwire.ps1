# ============================================================
#  Nightwire.ps1 — the tray app.
#
#  The overlay server is a background process with no window, which
#  is right for something that runs all stream. What was missing was
#  anywhere to SEE it: once it was hidden, the only ways to open the
#  dashboard, restart it or stop it were double-clicking .bat files
#  or ending tasks by hand — which is how a machine ends up with
#  eight orphaned node.exe processes and no idea which is serving.
#
#  This is that missing surface. It owns the server it starts, so
#  quitting stops exactly one thing, and it uses the server's own
#  /api/shutdown rather than force-killing, so nothing is orphaned.
#
#  Stock Windows only: WinForms + .NET, no modules, no admin rights.
#  Launched with no console by Nightwire.vbs.
# ============================================================

$ErrorActionPreference = 'Stop'

# Everything written here goes to tray.log (Nightwire.vbs redirects it). A tray
# icon that does not appear is otherwise indistinguishable from one that was
# never launched, and both look like "the shortcut does nothing".
Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] tray starting"
Write-Output "  PowerShell : $($PSVersionTable.PSVersion)"
Write-Output "  Policy     : $(Get-ExecutionPolicy)"
Write-Output "  Folder     : $(Split-Path -Parent $MyInvocation.MyCommand.Path)"

# Script-wide: any terminating error lands in the log with its location,
# rather than killing a hidden process in silence.
trap {
    Write-Output "TRAY FAILED: $($_.Exception.Message)"
    Write-Output $_.ScriptStackTrace
    exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Write-Output "  WinForms   : loaded"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8787
$Base = "http://127.0.0.1:$Port"

# Only ever one tray icon, however many times the shortcut is clicked — Setup
# starts it, the Startup shortcut starts it, and the desktop icon starts it.
# Deliberately not a Global\ name: this is per-signed-in-user, and Global
# needs privileges that a plain user session cannot always claim.
$mutex = New-Object System.Threading.Mutex($false, 'NightwireTraySingleInstance')
if (-not $mutex.WaitOne(0, $false)) { exit 0 }

# ---------------------------------------------------------------- server

function Get-ServerHealth {
    try {
        return Invoke-RestMethod -Uri "$Base/api/health" -TimeoutSec 2 -ErrorAction Stop
    } catch { return $null }
}

# Is a server answering, and is it THIS folder's? A different folder holding
# the port is the thing that makes an update look like it did nothing, so it
# is worth saying out loud rather than starting a second one that cannot bind.
function Get-ServerState {
    $health = Get-ServerHealth
    if ($null -eq $health) { return @{ Running = $false; Ours = $false; Root = $null } }
    $theirs = $null
    if ($health.PSObject.Properties.Name -contains 'root') { $theirs = $health.root }
    $ours = $false
    if ($theirs) {
        try {
            $ours = ([IO.Path]::GetFullPath($theirs).TrimEnd('\')) -ieq ([IO.Path]::GetFullPath($Root).TrimEnd('\'))
        } catch { $ours = $false }
    }
    return @{ Running = $true; Ours = $ours; Root = $theirs }
}

$script:Server = $null

function Start-Server {
    $state = Get-ServerState
    if ($state.Running) { return $true }

    # Redirect through cmd rather than capturing the pipes here. A server that
    # runs all stream keeps writing, and a redirected pipe nobody drains fills
    # and blocks the process it belongs to. Letting the shell write server.log
    # is what start-hidden.vbs already did, and it cannot deadlock.
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'cmd.exe'
    $psi.Arguments = '/c node server.mjs > server.log 2>&1'
    $psi.WorkingDirectory = $Root
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    try {
        $script:Server = [System.Diagnostics.Process]::Start($psi)
    } catch {
        return $false
    }

    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 400
        if ((Get-ServerState).Running) { return $true }
    }
    return $false
}

# Graceful, via the server's own endpoint. Force-killing is what left orphans
# behind; this asks it to close its own listeners and exit.
function Stop-Server {
    try {
        Invoke-RestMethod -Uri "$Base/api/shutdown" -Method Post -TimeoutSec 5 -ErrorAction Stop | Out-Null
    } catch { }
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-ServerState).Running) { break }
        Start-Sleep -Milliseconds 250
    }
    # Only ever our own child, and only if it ignored the polite request.
    # /T because the child is a cmd wrapper: killing it alone would leave the
    # node process behind, which is precisely the orphan this replaces.
    if ($script:Server -and -not $script:Server.HasExited) {
        try {
            Start-Process -FilePath 'taskkill.exe' `
                -ArgumentList '/PID', $script:Server.Id, '/T', '/F' `
                -WindowStyle Hidden -Wait
        } catch { }
    }
    $script:Server = $null
}

# ---------------------------------------------------------------- tray

$icon = $null
$icoPath = Join-Path $Root 'obs\nightwire.ico'
if (Test-Path $icoPath) {
    try { $icon = New-Object System.Drawing.Icon($icoPath) } catch { $icon = $null }
}
if ($null -eq $icon) { $icon = [System.Drawing.SystemIcons]::Application }

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icon
$tray.Text = 'Nightwire'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

function Add-Item($text, $action) {
    $item = New-Object System.Windows.Forms.ToolStripMenuItem
    $item.Text = $text
    $item.Add_Click($action)
    $menu.Items.Add($item) | Out-Null
    return $item
}

$statusItem = Add-Item 'Checking...' { }
$statusItem.Enabled = $false
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

Add-Item 'Open dashboard' { Start-Process "$Base/dashboard.html" } | Out-Null
Add-Item 'Open setup guide' {
    $guide = Join-Path $Root 'START HERE.html'
    if (Test-Path $guide) { Start-Process $guide }
} | Out-Null
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

Add-Item 'Restart server' {
    Stop-Server
    if (Start-Server) {
        $tray.BalloonTipTitle = 'Nightwire'
        $tray.BalloonTipText = 'Server restarted.'
    } else {
        $tray.BalloonTipTitle = 'Nightwire'
        $tray.BalloonTipText = 'The server did not come back — see server.log.'
    }
    $tray.ShowBalloonTip(3000)
} | Out-Null

Add-Item 'Stop server and quit' {
    Stop-Server
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
} | Out-Null

Add-Item 'Leave running and close this menu' {
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
} | Out-Null

$tray.ContextMenuStrip = $menu
$tray.Add_MouseDoubleClick({ Start-Process "$Base/dashboard.html" })

# Tooltip and the greyed-out first line both say the same thing: whether the
# overlay is actually being served, and by which copy of the package.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
    $state = Get-ServerState
    if (-not $state.Running) {
        $statusItem.Text = 'Server: not running'
        $tray.Text = 'Nightwire — not running'
    } elseif ($state.Ours) {
        $statusItem.Text = 'Server: running'
        $tray.Text = "Nightwire — running on port $Port"
    } else {
        $statusItem.Text = 'Server: ANOTHER COPY is serving'
        # 63 characters is the documented limit for NotifyIcon.Text.
        $other = if ($state.Root) { $state.Root } else { 'unknown folder' }
        $tray.Text = 'Nightwire — another copy is serving'
        $statusItem.ToolTipText = $other
    }
})
$timer.Start()

if (-not (Start-Server)) {
    Write-Output '  server     : NOT RUNNING (see server.log)'
    $tray.BalloonTipTitle = 'Nightwire'
    $tray.BalloonTipText = 'The overlay server did not start. See server.log in the package folder.'
    $tray.ShowBalloonTip(5000)
} else {
    Write-Output '  server     : running'
}
$timer.Enabled = $true

Write-Output '  icon       : visible - tray is up'
[System.Windows.Forms.Application]::Run()
Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] tray exited"

$tray.Visible = $false
$tray.Dispose()
$mutex.ReleaseMutex()
