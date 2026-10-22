param([Parameter(Mandatory = $true)][string]$RuntimePath)

$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($RuntimePath)
if (!(Test-Path -LiteralPath $runtime -PathType Leaf) -or
    (Split-Path -Leaf $runtime) -ne 'gymnotes-node.exe' -or
    (Split-Path -Leaf (Split-Path -Parent $runtime)) -ne 'runtime' -or
    (Split-Path -Leaf (Split-Path -Parent (Split-Path -Parent $runtime))) -ne '.gymnotes') {
  throw 'Invalid GymNotes runtime path.'
}
$signature = Get-AuthenticodeSignature -LiteralPath $runtime
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=OpenJS Foundation') {
  throw 'The GymNotes runtime must be an unmodified, signed Node.js executable.'
}

# Private local destinations plus LocalSubnet sources survive DHCP address changes.
$addresses = @('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')

$specs = @(
  @{ Name = 'GymNotes.LocalAgent.LocalSubnet'; Protocol = 'TCP'; Port = '3847'; Addresses = $addresses },
  @{ Name = 'GymNotes.LocalAgent.Discovery'; Protocol = 'UDP'; Port = '5353'; Addresses = @($addresses) + @('224.0.0.251') }
)
$pending = @()
foreach ($spec in $specs) {
  $rule = Get-NetFirewallRule -Name $spec.Name -ErrorAction SilentlyContinue
  if (!$rule) { $pending += $spec; continue }
  if ($rule.Group -ne 'GymNotes') { throw 'A firewall rule with this name belongs to another application.' }
  $program = $rule | Get-NetFirewallApplicationFilter
  if ($program.Program -ne $runtime) { throw 'The existing GymNotes rule points to a different executable.' }
  $ports = $rule | Get-NetFirewallPortFilter
  $network = $rule | Get-NetFirewallAddressFilter
  if ($rule.Enabled -eq 'True' -and $rule.Direction -eq 'Inbound' -and $rule.Action -eq 'Allow' -and
      $rule.Profile -eq 'Any' -and $rule.EdgeTraversalPolicy -eq 'Block' -and
      $ports.Protocol -eq $spec.Protocol -and @($ports.LocalPort).Count -eq 1 -and $ports.LocalPort -eq $spec.Port -and
      @($network.RemoteAddress).Count -eq 1 -and $network.RemoteAddress -eq 'LocalSubnet' -and
      !(Compare-Object @($network.LocalAddress | Sort-Object) @($spec.Addresses | Sort-Object))) {
    continue
  }
  $pending += $spec
}
if ($pending.Count -eq 0) {
  Write-Output 'GymNotes local network access is already configured.'
  exit 0
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (!$admin) {
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"' + $PSCommandPath + '"'), '-RuntimePath', ('"' + $runtime + '"'))
  $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  exit $child.ExitCode
}

foreach ($spec in $pending) {
  $parameters = @{
    Name = $spec.Name; Enabled = 'True'; Direction = 'Inbound'; Action = 'Allow'; Profile = 'Any'
    Program = $runtime; Protocol = $spec.Protocol; LocalPort = $spec.Port; RemoteAddress = 'LocalSubnet'
    LocalAddress = $spec.Addresses; EdgeTraversalPolicy = 'Block'
  }
  if (Get-NetFirewallRule -Name $spec.Name -ErrorAction SilentlyContinue) {
    Set-NetFirewallRule @parameters | Out-Null
  } else {
    New-NetFirewallRule @parameters -DisplayName ('GymNotes - ' + $spec.Protocol + ' ' + $spec.Port + ' local only') -Group 'GymNotes' | Out-Null
  }
}
Write-Output 'GymNotes local network access configured. Other firewall rules and network profiles were not changed.'
