<div align="center">
  <img src="icon.svg" alt="WebSniper Logo" width="128" />
  <h1>WebSniper</h1>
  <p><b>Turn any website into a REST API with one click. Local-first. BYOK.</b></p>

  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
    <img src="https://img.shields.io/github/stars/atharvmantri/WebSniper.svg" alt="Stars" />
    <img src="https://img.shields.io/github/forks/atharvmantri/WebSniper.svg" alt="Forks" />
    <img src="https://img.shields.io/badge/version-1.0.0-success.svg" alt="Version 1.0.0" />
  </p>
</div>

## The Problem & The Solution

Traditional scrapers suck. React apps break them. Dynamic classes fail. 

WebSniper fixes this. We replace brittle scripts with visual timelines, LLM-generated Playwright code, and autonomous self-healing. When a site changes, WebSniper adapts.

## Core Features

* **Visual Action Sequence:** Build and debug extractions visually.
* **Ghost Mode (Alt+S):** Untrackable execution.
* **1-Click API Deployment:** Instantly expose your extraction as a local REST endpoint.
* **Auto-Healing Execution:** AI fixes broken selectors on the fly.
* **Built-in Proxy Rotation:** Bypass rate limits automatically.

## Installation (The "1-Click" Setup)

Download and run the engine. Paste this into PowerShell:

```powershell
Invoke-WebRequest -Uri "https://github.com/atharvmantri/WebSniper/releases/download/v1.0.0/WebSniper-Release-v1.0.zip" -OutFile "$env:TEMP\websniper.zip"; Expand-Archive -Path "$env:TEMP\websniper.zip" -DestinationPath "C:\WebSniper" -Force; Start-Process "C:\WebSniper\WebSniper-Runner.exe"
```

### Load the Extension

1. Open `chrome://extensions/` in your browser.
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select the WebSniper extension folder.

## How it Works

The architecture is simple and local. A React/Vite Chrome Extension acts as the UI. It talks to a local Python FastAPI runner. The runner executes headless Chromium via Playwright.

## Contributing & License

WebSniper is open-source (MIT). Pull requests are encouraged.
