# ⚡ Lightning Radar — Real-Time Monitor (Desktop & Mobile)

A fast, modern **real-time lightning monitoring radar** designed for both desktop computers and mobile devices (smartphones and tablets).

---

## 🌟 Key Features

* **Clean, Focused & Privacy-Oriented**: Zero tracking scripts, zero bloatware.
* **Real-Time Global Detection**: Low-latency stream connecting to the global Blitzortung volunteer radio multilateration network.
* **Expanding Acoustic Thunder Waves**: Concentric shockwaves propagating outward at the speed of sound ($343\text{ m/s}$ / $1235\text{ km/h}$) to visualize when thunder will arrive at your location.
* **Detector Station Triangulation Rays**: Real-time lines connecting detector receivers to the strike epicenter during multilateration calculation.
* **Color-Coded Age Decay Ramp**:
  * ⚪ **< 1 min**: Bright flashing white dot with radiant halo
  * 🟡 **1–5 min**: Yellow
  * 🟠 **5–20 min**: Orange
  * 🔴 **20–60 min**: Red
  * 🟣 **> 60 min**: Fading purple/gray
* **Web Audio API Synthesizer**:
  * Realistic distance-attenuated thunder rumbles (low-pass filtered brown/pink noise burst).
  * High-frequency electromagnetic discharge crackle on detection.
  * Proximity safety alarm when lightning strikes within your configured perimeter.
* **Live Weather Radar Overlay**: Integrated RainViewer real-time precipitation radar layer with customizable opacity.
* **Mobile-First Touch UI & PWA Ready**: Installable as a standalone app on iOS, Android, macOS, and Windows.

---

## 🚀 Quick Start Guide

### 1. Requirements
* Python 3.9+ installed on your machine.

### 2. Launch the Application
In your terminal, navigate to the folder and run:
```bash
# Install dependencies (only required once)
pip install -r requirements.txt

# Start the lightning radar server
python server.py
```

### 3. Open on Desktop
Open your browser and navigate to:
```
http://localhost:8080
```

### 4. Open on Mobile / Tablet (Local Wi-Fi)
When `server.py` starts, it prints your local IP address (e.g. `http://192.168.1.50:8080`).
1. Connect your smartphone or tablet to the same Wi-Fi network as your computer.
2. Open Safari (iOS) or Chrome (Android) and go to `http://<your-computer-ip>:8080`.

---

## 📱 Mobile & Desktop Installation (PWA)

This application is built as a **Progressive Web App (PWA)**:

### On iOS (iPhone / iPad):
1. Open `http://<your-computer-ip>:8080` in **Safari**.
2. Tap the **Share** button (the square with the upward arrow).
3. Scroll down and tap **"Add to Home Screen"**.
4. The Lightning Radar icon will appear on your home screen and open in full-screen standalone mode without any browser URL bars.

### On Android:
1. Open `http://<your-computer-ip>:8080` in **Chrome**.
2. Tap the **"Install App"** banner or tap the three dots menu (⋮) -> **"Install app"** / **"Add to Home screen"**.

### On Windows / Mac Desktop (Standalone Window):
1. In Chrome or Edge, click the **Install App** icon in the address bar (top right).
2. The app will run in its own dedicated, distraction-free desktop window.

---

## 🛠️ Architecture Overview

```
c:\Users\Richard\OneDrive\Desktop\Lightning
├── server.py             # Asynchronous WebSocket proxy, strike buffer & PWA host
├── requirements.txt      # Python dependencies (aiohttp, websockets)
├── README.md             # Documentation
└── public/               # Frontend Application Shell
    ├── index.html        # HTML5 PWA Shell & Glassmorphic HUD
    ├── manifest.json     # Web App Manifest
    ├── sw.js             # Service Worker for offline asset caching
    ├── css/
    │   └── style.css     # Dark glassmorphic responsive styles
    ├── js/
    │   ├── app.js        # Main controller & UI state coordinator
    │   ├── renderer.js   # 60 FPS HTML5 Canvas Overlay Engine
    │   ├── audio.js      # Web Audio API Synthesizer (Thunder & Crackle)
    │   ├── radar.js      # RainViewer Live Weather Radar integration
    │   └── stations.js   # Detector Station registry
    └── icons/
        ├── icon.svg      # Vector app icon
        ├── icon-192.png  # PWA icon 192x192
        └── icon-512.png  # PWA icon 512x512
```

---

## ⚙️ Customization & Controls

Click the **Menu button (☰)** on the top right to adjust:
* **Acoustic Thunder Waves**: Toggle expanding sound wave circles on/off.
* **Station Detector Rays**: Toggle triangulation lines.
* **Live Weather Radar**: Toggle precipitation radar and adjust opacity slider.
* **History Duration**: Select strike retention window (15m, 30m, 60m, 120m).
* **Audio Engine**: Enable/disable sound effects, thunder rumbles, detection crackles, and volume.
* **Proximity Safety Perimeter**: Set alert radius (5 km to 100 km).
* **Map Style**: Choose between **Dark Matter**, **Satellite Imagery**, **OpenStreetMap**, or **Light Voyager**.
