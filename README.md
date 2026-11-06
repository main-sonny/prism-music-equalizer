<div align="center">

# Prism Music Equalizer

### Your sound. Your visuals. Your studio.

A local music-video studio for audio-reactive visuals, animated artwork, and MP4 creation.

**Version 1.0.0** &nbsp; · &nbsp; **Developed by Sonny** &nbsp; · &nbsp; **Local-first**

[Features](#features) · [Getting started](#getting-started) · [Workflow](#workflow) · [Exporting](#exporting) · [Development](#development)

</div>

---

## Overview

Prism turns audio into customizable visualizer videos from a browser-based studio running on your own computer. Combine reactive graphics, cover artwork, animated GIFs, typography, and processed audio, then export a composition sized for your platform.

The interface and browser dependencies are bundled. No account, API key, CDN, frontend build step, or Python package installation is required to run the application.

| Create | Customize | Export |
| :--- | :--- | :--- |
| Twelve audio-reactive visualizers | Artwork, GIFs, typography, and color themes | H.264 video with AAC audio |
| Bass-triggered visual effects | Independent audio and video fades | Landscape, portrait, square, and custom sizes |
| Three-band audio EQ | Portable projects and browser autosave | Local FFmpeg encoding |

<img src="public/assets/preview.png" alt="Prism logo" width="88">

## Features

### Audio-reactive design

- **Twelve visualizers:** Halo, Spectrum, Waveform, Reflection, Orbit, Frequency, Ripple, Flower, Spiral, Dot matrix, Mountain, and Tunnel.
- **Bass-reactive motion:** pulse the visualizer and central cover together, with separate controls for cover response, glow, and camera motion.
- **Composition controls:** sensitivity, smoothing, frequency bands, size, stroke, rotation, mirroring, and visual-layer switches.
- **Finishing effects:** glow, particles, grid, vignette, and optional bass-hit or timer-triggered flashing.

### Artwork and identity

- Import supported MP3 metadata and embedded cover artwork automatically.
- Customize title, artist, channel handle, artwork, and optional watermark text.
- Choose ambient gradients, solid colors, cover artwork, photos, or animated GIF backgrounds.
- Use animated GIF covers and backgrounds with the bundled offline decoder.
- Select system fonts or specify another installed font family.
- Capture a PNG or use fullscreen preview and composition guides.

### Audio and project controls

- Adjust bass, midrange, treble, and output volume.
- Select clip start and end points using the track waveform and timing controls.
- Set separate audio fades and video fades to/from black.
- Save portable `.prism` projects containing media and settings.
- Restore the latest local session through browser autosave.
- Undo and redo styling and settings changes.

> Track-detail and artwork edits change the project and rendered video. They do not rewrite tags or artwork in the original audio file.

## Getting started

### Requirements

| Component | Requirement |
| :--- | :--- |
| Python | 3.10 or newer |
| Browser | Current desktop Chrome or Edge recommended |
| FFmpeg | Available on PATH, with `libx264` and AAC encoding support |
| Node.js | Only needed for optional browser regression tests |

FFmpeg is required for MP4 export, not for previewing or saving projects.

### 1. Download the project

Clone this repository or choose **Code → Download ZIP** on GitHub. If downloading a ZIP, extract it first. Open a terminal in the project folder containing `server.py`.

### 2. Install FFmpeg

Use the appropriate command if the package manager is available on your system:

| Platform | Command |
| :--- | :--- |
| Windows / WinGet | `winget install --id Gyan.FFmpeg -e` |
| macOS / Homebrew | `brew install ffmpeg` |
| Debian / Ubuntu | `sudo apt install ffmpeg` |

Reopen your terminal after installation, then verify:

```sh
ffmpeg -version
```

Alternatively, set `FFMPEG_PATH` to the full path of your FFmpeg executable before starting the server.

### 3. Launch the studio

```sh
python server.py
```

On Windows, you can use `py server.py`. On macOS or Linux, use `python3 server.py` if required.

Open **http://localhost:8080** in your browser.

Use the included 24-second demo or upload your own track. Stop the server with **Ctrl+C** when finished.

> Run the application through the Python server, not by opening `public/index.html` directly. GitHub hosts the source code; GitHub Pages cannot run the Python/FFmpeg export backend.

<details>
<summary><strong>Custom port and encoder diagnostics</strong></summary>

If port 8080 is occupied:

```sh
python server.py --port 8090
```

Then open `http://localhost:8090`.

The studio's encoder indicator shows whether FFmpeg is available. You can also check `/api/health` on the running server. Restart the server after installing FFmpeg or updating its path.

Autosave belongs to the browser origin. Changing the port, hostname, or browser profile creates a separate saved session.

</details>

## Workflow

| Step | Action |
| :--- | :--- |
| **01 — Import** | Upload audio or load the demo. Review the imported track details and cover. |
| **02 — Design** | Select a visualizer, customize colors and typography, and choose your background. |
| **03 — React** | Adjust bass pulse, cover response, glow, and other optional effects. |
| **04 — Trim** | Set clip start/end, EQ, volume, and audio fades. |
| **05 — Finish** | Open **Output** to set video fades, dimensions, frame rate, and quality. |
| **06 — Export** | Select **Export video → Create MP4 video**, then download the completed file. |

### Video fades

Find **Video fade in** and **Video fade out** at the top of the **Output** tab. Each supports **0–5 seconds**; `0` disables that fade. They apply at the selected clip boundaries and are independent of the audio fades in **Audio**.

### Projects and backups

Use **Save project** to download a portable `.prism` file, and **Open project** to restore it. Browser autosave uses IndexedDB and restores the latest session at the same local address.

Wait for **Saved on this device** before closing the tab. Browser storage can be cleared or evicted, so keep downloaded project backups for important work. Fonts are not embedded; another computer needs the same font installed.

### Keyboard shortcuts

Shortcuts apply when focus is outside form controls and dialogs.

| Shortcut | Action |
| :--- | :--- |
| `Space` | Play / pause |
| `Left` / `Right` | Seek backward / forward five seconds |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + S` | Save project |

## Exporting

### Output presets

| Preset | Dimensions | Aspect ratio |
| :--- | :--- | :--- |
| YouTube | 1920 × 1080 | 16:9 |
| YouTube Shorts / TikTok / Instagram Reels | 1080 × 1920 | 9:16 |
| Instagram Post | 1080 × 1080 | 1:1 |
| Portrait feed | 1080 × 1350 | 4:5 |
| Vimeo / Facebook | 1920 × 1080 | 16:9 |
| Custom | 240–3840 pixels per side; even dimensions | Custom |

Available frame rates: **24, 30, 60, 90, and 120 FPS**. Quality options: **Draft, Balanced, and Ultra**. Presets are sizing conveniences, not automatic publishing or guarantees of platform acceptance.

### How export works

```text
Canvas animation + processed audio
                  |
                  v
     Browser WebM recording
                  |
                  v
       Local Python server
                  |
                  v
       FFmpeg H.264 + AAC
                  |
                  v
          Downloadable MP4
```

Recording happens **in real time**, followed by local encoding. A five-minute clip therefore takes approximately five minutes to record, plus conversion time. Save the finished MP4 before stopping the server; export files are temporary.

### Performance and known limitations

- Keep the studio tab visible and the browser unminimized. Hiding the document stops recording.
- Start with **1280 × 720 at 30 FPS** for landscape or **720 × 1280 at 30 FPS** for portrait, using Balanced quality.
- Higher resolutions, high frame rates, animated GIFs, blur, particles, and glow increase the recording workload.
- Requested FPS is an output target, not a guarantee of unique captured frames. Hardware, display refresh, and browser scheduling affect capture; encoding may duplicate frames.
- A laggy export and a 10-second selection producing a roughly 6-second output have been reported. The cause remains unconfirmed and the issue is unresolved in v1.3.1. Verify clip boundaries and the downloaded file's duration before relying on an export; lower settings are a performance workaround, not a confirmed duration fix.
- Clip duration is **end minus start**. For example, start `4` and end `10` selects six seconds.
- Export regression tests ran in headless Chromium on Linux. Windows and macOS were not directly tested in that environment; mobile browsers and Safari/Firefox are not verified export targets.

### Media limits

| Asset | Limit |
| :--- | :--- |
| Audio | 200 MB; 0.25 seconds to two hours |
| Images | 30 MB each |
| GIFs | Up to 1000 frames and 16 megapixels per source frame |
| Project imports | 330 MB |
| Browser recording | Approximately 1450 MiB; practical limits depend on available memory |

Still images are downscaled and converted to JPEG, without transparency. GIF data is preserved; decoded frames are downscaled to control memory use. Re-upload GIFs that an older version flattened into still images. MP3 and WAV are recommended; other audio formats depend on browser support.

## Safety and privacy

**Photosensitivity warning:** flashing and animated imagery can trigger seizures or discomfort. Flashing is disabled by default. Bass-triggered flashes may exceed the timer mode's 2 Hz maximum, and uploaded GIFs may contain additional flashing. No setting guarantees safety. Avoid these effects if sensitive and review videos before sharing.

Prism runs locally once its prerequisites are installed. Browser dependencies are bundled, media processing happens in the browser, and recordings are sent to the server on your own computer. There are no analytics or cloud-upload integrations.

The server binds to `127.0.0.1` and is intended for single-user local use. **Do not expose it to the public internet or place it behind a public reverse proxy.** Open only trusted media and project files, and publish only content you have permission to use.

## Development

### Technology

| Layer | Implementation |
| :--- | :--- |
| Interface | Vue and Bootstrap |
| Visualization | Canvas 2D and Web Audio API |
| Metadata | jsmediatags |
| GIF decoding | omggif |
| Persistence | IndexedDB and portable `.prism` files |
| Capture | Canvas capture stream and MediaRecorder |
| Backend | Python standard library |
| MP4 encoding | FFmpeg |

### Notes

Currently im a small creator so it would be appreciated if you could support me by following me or starring the project, after the project hits 10 stars I would start updating the project so you guys would have access to more features.

### Regression tests

Start the studio server in a separate terminal. With Node.js installed:

```sh
npm install --no-save playwright-core
npx playwright-core install chromium
node tests/browser.mjs
node tests/backgrounds.mjs
node tests/bass-playback.mjs
```

Tests require FFmpeg and FFprobe on PATH. Optional environment overrides include `PRISM_URL`, `TEST_OUTPUT`, `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `FFMPEG_PATH`, and `FFPROBE_PATH`.

Coverage includes metadata import, playback, visualizers, project persistence, GIF decoding without native `ImageDecoder`, real-audio bass pulses and flashes, MP4 export, cancellation, and responsive layout checks. Short exports were checked at 30/90/120 FPS; this does not establish performance or timing reliability for every machine and output setting.

### Reporting issues

When reporting a problem, include your operating system, browser version, output dimensions, FPS, quality, clip start/end values, and steps to reproduce. For export issues, include the expected and actual file duration and whether audio, video, or both are affected. Share only media you have permission to distribute.

## Credits and licensing

**Created by Sonny.**

Prism bundles Vue, Bootstrap, jsmediatags, and omggif. Their upstream license notices are retained in `public/vendor/`, including the `*.LICENSE` files and `omggif-LICENSE.txt`. The demo audio and artwork were generated for this project.

No project-wide license is currently included. Third-party licenses apply to their respective dependencies; they do not establish a license for Prism's original code.

---

<div align="center">

**Prism Music Equalizer**  
A local studio for turning sound into motion.

</div>
