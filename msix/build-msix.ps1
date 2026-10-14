<#
.SYNOPSIS
  Packages Breathe as an MSIX for the Microsoft Store.

.DESCRIPTION
  1. Build the app first (no installers needed):
       npm run tauri build -- --no-bundle
  2. Then run this script with your Partner Center identity values
     (Partner Center > your app > Product management > Product identity):
       .\msix\build-msix.ps1 -IdentityName "12345Name.Breathe" `
                             -Publisher "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" `
                             -PublisherDisplayName "Your Name"
     The values can also come from the environment variables MSIX_IDENTITY_NAME,
     MSIX_PUBLISHER and MSIX_PUBLISHER_DISPLAY_NAME (that's how GitHub Actions passes them).

  The .msix is written to dist-msix\. Upload it in Partner Center as-is: the Store
  signs it for you, so no certificate is needed.

  To try the packaged app on this PC before uploading, add -Register
  (needs Settings > System > For developers > Developer Mode turned on).

.PARAMETER Version
  Package version. Defaults to the version in src-tauri\tauri.conf.json plus ".0"
  (the Store requires the last number to be 0).
#>
param(
  [string]$IdentityName = $env:MSIX_IDENTITY_NAME,
  [string]$Publisher = $env:MSIX_PUBLISHER,
  [string]$PublisherDisplayName = $env:MSIX_PUBLISHER_DISPLAY_NAME,
  [string]$DisplayName = $(if ($env:MSIX_DISPLAY_NAME) { $env:MSIX_DISPLAY_NAME } else { "Breathe" }),
  [string]$Version,
  [switch]$Register
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Fail($message) {
  Write-Host ""
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

# --- Check the identity values -------------------------------------------------
if (-not $IdentityName) { Fail "Missing -IdentityName (Partner Center: Package/Identity/Name)." }
if (-not $Publisher) { Fail "Missing -Publisher (Partner Center: Package/Identity/Publisher, starts with CN=)." }
if (-not $PublisherDisplayName) { Fail "Missing -PublisherDisplayName (Partner Center: Package/Properties/PublisherDisplayName)." }
if (-not $Publisher.StartsWith("CN=")) { Fail "Publisher should start with 'CN=' exactly as shown in Partner Center." }

# --- Version -------------------------------------------------------------------
if (-not $Version) {
  $conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
  $Version = "$($conf.version).0"
}
if ($Version -notmatch '^\d+\.\d+\.\d+\.0$') { Fail "Version must look like 1.2.3.0 (got '$Version')." }

# --- Find the built app ----------------------------------------------------------
$candidates = @(
  "src-tauri\target\release\Breathe.exe",
  "src-tauri\target\release\tauri-app.exe",
  "src-tauri\target\x86_64-pc-windows-msvc\release\Breathe.exe",
  "src-tauri\target\x86_64-pc-windows-msvc\release\tauri-app.exe"
) | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
$exe = $candidates | Select-Object -First 1
if (-not $exe) { Fail "Couldn't find the built app. Run 'npm run tauri build -- --no-bundle' first." }
Write-Host "App:      $exe"

# --- Find makeappx (Windows SDK) ---------------------------------------------------
$kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
$makeappx = Get-ChildItem -Path $kits -Filter makeappx.exe -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $makeappx) { Fail "makeappx.exe not found. Install the Windows SDK (Visual Studio Installer > Individual components > Windows 11 SDK)." }

# --- Lay out the package -----------------------------------------------------------
$out = Join-Path $root "dist-msix"
$layout = Join-Path $out "layout"
if (Test-Path $layout) { Remove-Item $layout -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $layout "Assets") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $layout "icons") -Force | Out-Null

Copy-Item $exe (Join-Path $layout "Breathe.exe")
Copy-Item (Join-Path $PSScriptRoot "Assets\*") (Join-Path $layout "Assets")
# Notification icon (the app looks for it next to the exe)
Copy-Item (Join-Path $root "src-tauri\icons\128x128.png") (Join-Path $layout "icons")

function XmlEscape([string]$s) { [System.Security.SecurityElement]::Escape($s) }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$manifest = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot "AppxManifest.template.xml"), $utf8)
$manifest = $manifest.Replace("{{IDENTITY_NAME}}", (XmlEscape $IdentityName))
$manifest = $manifest.Replace("{{PUBLISHER_DISPLAY_NAME}}", (XmlEscape $PublisherDisplayName))
$manifest = $manifest.Replace("{{PUBLISHER}}", (XmlEscape $Publisher))
$manifest = $manifest.Replace("{{DISPLAY_NAME}}", (XmlEscape $DisplayName))
$manifest = $manifest.Replace("{{VERSION}}", $Version)
[System.IO.File]::WriteAllText((Join-Path $layout "AppxManifest.xml"), $manifest, $utf8)

# --- Pack ----------------------------------------------------------------------------
$msix = Join-Path $out "Breathe_$($Version)_x64.msix"
& $makeappx.FullName pack /d $layout /p $msix /o
if ($LASTEXITCODE -ne 0) { Fail "makeappx failed (exit code $LASTEXITCODE)." }

Write-Host ""
Write-Host "Done: $msix" -ForegroundColor Green
Write-Host "Upload this file in Partner Center > your app > Packages."

if ($Register) {
  Write-Host ""
  Write-Host "Installing the unpacked layout on this PC for testing..."
  Add-AppxPackage -Register (Join-Path $layout "AppxManifest.xml")
  Write-Host "Installed. Find '$DisplayName' in the Start menu. Remove it later from Settings > Apps."
}
