<div align="center">
  <img src="./public/icon.svg" width="120" />
  
  # WebSniper
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Release: v1.0.0](https://img.shields.io/badge/Release-v1.0.0-blue.svg)](https://github.com/atharvmantri/WebSniper/releases/tag/v1.0.0)
  [![Stars](https://img.shields.io/github/stars/atharvmantri/WebSniper?style=social)](https://github.com/atharvmantri/WebSniper/stargazers)
  
  **Turn any website into a local REST API in one click. Powered by BYOK LLMs and self-healing Playwright agents.**
</div>

<br/>

> [!NOTE]
> Insert 45-second Demo GIF here

## Core Features

| Feature | Description |
| :--- | :--- |
| **Visual Macro Timeline** | Construct complex web interactions visually without writing a single line of scraper code. |
| **Autonomous Self-Healing** | Built-in Playwright agents dynamically adjust to layout shifts and DOM structure changes. |
| **1-Click API Deployment** | Turn any automated sequence into a robust, headless REST API endpoint instantly. |
| **Proxy Rotation** | Seamlessly cycle through configured proxy pools to ensure uninterrupted scraping operations. |

## Quickstart

### Install the Silent Engine

Deploy the background automation server directly via PowerShell:

```powershell
Invoke-WebRequest -Uri "https://github.com/atharvmantri/WebSniper/releases/download/v1.0.0/WebSniper-Release-v1.0.zip" -OutFile "$env:TEMP\websniper.zip"; Expand-Archive -Path "$env:TEMP\websniper.zip" -DestinationPath "C:\WebSniper" -Force; Start-Process "C:\WebSniper\WebSniper-Runner.exe"
```

### Load the Extension

1. Clone this repository and build the extension if needed.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** on.
4. Click **Load unpacked** and select the `dist` folder.

## API Usage

Trigger your targeted workflows programmatically against the local runner.

```bash
curl -X POST "http://localhost:8000/api/v1/run/{task}" \
     -H "Content-Type: application/json" \
     -d '{
           "target_url": "https://example.com",
           "parameters": {
             "search_term": "query"
           }
         }'
```
