<#
  Pressling on Windows: installs it the first time, updates it every time after, and opens it.

  Run it from this folder:              powershell -ExecutionPolicy Bypass -File install.ps1
  or straight from GitHub, in PowerShell:  irm https://raw.githubusercontent.com/Vasco-Alves/pressling/main/install.ps1 | iex

  What it does, asking first before it installs anything else:
    1. uv, the small tool Pressling is installed with: if it's missing, its official installer (astral.sh), once you say yes.
    2. Pressling itself: from PyPI once it is published there (only this project's own release), else the newest code on GitHub.
    3. ffmpeg, only if you want it (the Curator needs it, plain playing doesn't): with winget.
    4. Your Discogs token, if there isn't one yet: it opens the page where you make one and a .env file in Notepad to paste it into.
       The token never passes through this script.
    5. curator doctor, to show what is ready, and then Pressling opens in your browser.

  -NoOpen     does everything but open Pressling at the end
  -DryRun     only says what it would do: nothing is installed, changed or opened
#>
param([switch]$NoOpen, [switch]$DryRun)

$ErrorActionPreference = "Stop"
$Repo = "https://github.com/Vasco-Alves/pressling"
$FromGitHub = "pressling @ $Repo/archive/refs/heads/main.zip"

function Say($text) { Write-Host $text }
function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Ask($question, $yes) { # a yes or no question; Enter gives the answer shown in capitals. Where nobody can answer, it is no (in a dry run, the answer shown)
  $hint = if ($yes) { "[Y/n]" } else { "[y/N]" }
  if ($DryRun) { Say "$question $hint  (dry run: taken as the default)"; return $yes }
  try { $answer = Read-Host "$question $hint" } catch { Say "$question $hint  (nobody to ask here: no)"; return $false }
  if ([string]::IsNullOrWhiteSpace($answer)) { return $yes }
  return $answer.Trim() -match '^(y|yes)$'
}
function Run($what, [scriptblock]$command) { # runs it, or with -DryRun only says it would
  if ($DryRun) { Say "  (dry run) would run: $what"; return }
  & $command
}
function Has($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function FreshPath { # what an installer just added to PATH, for this window too
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.local\bin"
}

Say "Pressling: install, update and open."
if ($DryRun) { Say "(dry run: nothing will be installed, changed or opened)" }

Step "uv"
if (Has "uv") { Say "uv is there." }
else {
  Say "Pressling is installed with uv, a small free tool from Astral that installs Python apps (and Python itself if you don't have it)."
  if (-not (Ask "uv isn't installed. Install it now with its official installer from astral.sh?" $true)) {
    Say "Nothing was changed. You can install uv yourself (https://docs.astral.sh/uv/) and run this again."
    return # (return, not exit: run with irm | iex, exit would close your PowerShell window)
  }
  Run "the uv installer from https://astral.sh/uv/install.ps1" { powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex" }
  FreshPath
  if (-not $DryRun -and -not (Has "uv")) { Say "uv was installed, but this window can't see it yet. Open a new PowerShell window and run this again."; return }
}

Step "Pressling"
$onPyPI = $false
try { # only this project's own release on PyPI, never another package that happens to have the same name
  $info = (Invoke-RestMethod "https://pypi.org/pypi/pressling/json" -TimeoutSec 15).info
  $links = @($info.home_page) + @($info.project_urls.PSObject.Properties | ForEach-Object { $_.Value })
  $onPyPI = [bool]($links | Where-Object { "$_" -like "*github.com/Vasco-Alves/pressling*" })
} catch { $onPyPI = $false }
if ($onPyPI) {
  Say "Installing or updating Pressling from PyPI."
  Run "uv tool install --upgrade pressling" { uv tool install --upgrade pressling }
} else {
  Say "Installing or updating Pressling with the newest code on GitHub."
  Run "uv tool install --reinstall `"$FromGitHub`"" { uv tool install --reinstall $FromGitHub }
}
if (-not $DryRun -and $LASTEXITCODE) { Say "uv couldn't install Pressling (see above). Nothing else was changed."; return }
if (-not $DryRun -and -not (Has "pressling")) { # uv's folder for apps isn't on PATH yet: put it there for good, and for this window now
  uv tool update-shell | Out-Null
  $env:Path = (uv tool dir --bin) + ";$env:Path"
}

Step "ffmpeg"
if (Has "ffmpeg") { Say "ffmpeg is there." }
else {
  Say "ffmpeg isn't installed. Pressling plays your music without it; the Curator needs it to check that each song plays all the way through,"
  Say "to draw waveforms and to find a long quiet start or end."
  if (Ask "Install ffmpeg now with winget (Gyan.FFmpeg)?" $false) {
    if (Has "winget") { Run "winget install --id Gyan.FFmpeg -e" { winget install --id Gyan.FFmpeg -e }; FreshPath }
    else { Say "winget isn't on this computer. Get ffmpeg from https://www.gyan.dev/ffmpeg/builds/ and put its bin folder on PATH." }
  } else { Say "Left as it is. Run this again any time to add it." }
}

Step "Discogs token"
$doctor = @()
if (-not ($DryRun -and -not (Has "curator"))) { # (with its warnings on stderr too, which Windows PowerShell would otherwise stop on)
  $was = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $doctor = @(curator doctor 2>&1 | ForEach-Object { "$_" })
  $ErrorActionPreference = $was
}
$missing = $doctor | Where-Object { $_ -match '^DISCOGS_TOKEN: MISSING .* in (.+)\)$' } | Select-Object -First 1
if (-not $missing) { Say $(if ($doctor.Count) { "There is a token." } else { "(dry run) would check the token with curator doctor." }) }
else {
  $envFile = [regex]::Match($missing, ' in (.+)\)$').Groups[1].Value
  Say "The Curator looks songs up on Discogs, which needs a free token (plain playing doesn't)."
  if (Ask "Set it up now? This opens the Discogs page where you make one, and a file to paste it into." $true) {
    Run "create $envFile with an empty DISCOGS_TOKEN= line, if it isn't there" {
      New-Item -ItemType Directory -Force -Path (Split-Path $envFile) | Out-Null
      if (-not (Test-Path $envFile)) { Set-Content -Path $envFile -Value "DISCOGS_TOKEN=" -Encoding ASCII }
    }
    Say "On the Discogs page: Generate new token, copy it, paste it right after DISCOGS_TOKEN= in Notepad, save, and close Notepad."
    Run "open https://www.discogs.com/settings/developers" { Start-Process "https://www.discogs.com/settings/developers" }
    Run "open $envFile in Notepad" { Start-Process notepad.exe -ArgumentList "`"$envFile`"" }
    if (-not $DryRun) { try { Read-Host "When you've saved it, press Enter here to go on" | Out-Null } catch { } } # (the new Notepad can't always be waited for)
  } else { Say "Left as it is. Run this again any time to set it up." }
}

Step "Check"
Run "curator doctor" { curator doctor }

if ($NoOpen) { Say ""; Say "All set. Start it any time with: pressling"; return }
Step "Opening Pressling"
Say "Your browser opens. Keep this window open while you use it (Ctrl+C here stops it)."
Run "pressling" { pressling }
