param([string]$Title = "Notion schedule", [string]$Message = "")
# Windows toast notification (PowerShell 5.1, no modules)
$ErrorActionPreference = "Stop"
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
  $xml = "<toast scenario='reminder'><visual><binding template='ToastGeneric'><text>$(& $esc $Title)</text><text>$(& $esc $Message)</text></binding></visual><actions><action content='OK' arguments='ok' activationType='foreground'/></actions></toast>"
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show((New-Object Windows.UI.Notifications.ToastNotification $doc))
  "toast ok"
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  $n = New-Object System.Windows.Forms.NotifyIcon
  $n.Icon = [System.Drawing.SystemIcons]::Information
  $n.Visible = $true
  $n.ShowBalloonTip(15000, $Title, $Message, [System.Windows.Forms.ToolTipIcon]::Warning)
  Start-Sleep -Seconds 16
  $n.Dispose()
  "balloon fallback: $($_.Exception.Message)"
}
