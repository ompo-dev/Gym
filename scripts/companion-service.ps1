param(
  [ValidateSet('Install', 'Run', 'Verify', 'Start')][string]$Mode = 'Run',
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [int]$PeerPid = 0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

function Read-Config {
  $bytes = [IO.File]::ReadAllBytes($ConfigPath)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  return ([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json)
}

if ($Mode -eq 'Start') {
  # WMI launches outside the calling terminal's job; closing that terminal cannot kill the peer.
  $command = '"' + $PSHOME + '\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + $PSCommandPath + '" -Mode Run -ConfigPath "' + $ConfigPath + '"'
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
  $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command; ProcessStartupInformation = $startup }
  if ($created.ReturnValue -ne 0) { throw 'Unable to start companion' }
  exit 0
}

if ($Mode -eq 'Install') {
  $config = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($config.token -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid invitation' }
  foreach ($path in @($config.runtime, $config.script, $config.npm)) {
    if (-not [IO.Path]::IsPathRooted($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Missing runtime' }
  }
  $directory = Split-Path -Parent $ConfigPath
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $plain = [Text.Encoding]::UTF8.GetBytes(($config | ConvertTo-Json -Compress))
  $protected = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($ConfigPath, $protected)
  $launcher = '"' + $PSHOME + '\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + $PSCommandPath + '" -Mode Run -ConfigPath "' + $ConfigPath + '"'
  New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Force | Out-Null
  New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'GymNotesCompanion' -Value $launcher -PropertyType String -Force | Out-Null
  exit 0
}

$config = Read-Config
if ($Mode -eq 'Verify') {
  if ($PeerPid -eq 0) {
    $listeners = @(Get-NetTCPConnection -LocalPort 3847 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listeners.Count -ne 1) { throw 'Ambiguous listener' }
    $PeerPid = $listeners[0]
  }
  $peer = Get-CimInstance Win32_Process -Filter "ProcessId = $PeerPid"
  $owner = Invoke-CimMethod -InputObject $peer -MethodName GetOwnerSid
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($owner.Sid -ne $sid -or $peer.ExecutablePath -ine $config.runtime) { throw 'Unrelated process' }
  $expected = '"' + $config.script + '"'
  if (-not $peer.CommandLine.Contains($expected) -or $peer.CommandLine -notmatch '(?:^|\s)--lan(?:\s|$)') { throw 'Unrelated script' }
  # The caller has already authenticated this exact listener before asking to replace it.
  Stop-Process -Id $PeerPid -ErrorAction Stop
  exit 0
}

$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = New-Object Threading.Mutex($false, ('Local\GymNotesCompanion-' + $sid))
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
  while ($true) {
    $config = Read-Config
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $config.runtime
    $start.Arguments = '"' + $config.script + '" --lan'
    $start.WorkingDirectory = Split-Path -Parent (Split-Path -Parent $config.script)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.EnvironmentVariables['GYMNOTES_PAIRING_TOKEN'] = $config.token
    $start.EnvironmentVariables['GYMNOTES_NPM_CLI'] = $config.npm
    $start.EnvironmentVariables['GYMNOTES_COMPANION_SERVICE'] = '1'
    $start.EnvironmentVariables.Remove('GYMNOTES_CONNECT_TOKEN')
    $child = [Diagnostics.Process]::Start($start)
    $child.WaitForExit()
    # A port conflict is not a reason to replace another listener or spin forever.
    if ($child.ExitCode -eq 2) { break }
    Start-Sleep -Seconds 5
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
