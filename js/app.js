/**
 * Lightning Radar — Main Application Controller
 * Connects UI, Map, Canvas Renderer, Web Audio Synthesizer, and Live Streams.
 */

class LightningApp {
  constructor() {
    this.map = null;
    this.renderer = null;
    this.radar = null;
    this.ws = null;

    // User location state
    this.userLocation = null;
    this.userMarker = null;
    this.userAccuracyCircle = null;

    // Base map tile layers
    this.baseLayers = {};
    this.currentBaseLayer = null;

    // Stats & Settings
    this.settings = {
      thunderWaves: true,
      stationRays: true,
      radar: true,
      radarOpacity: 0.65,
      soundMaster: false,
      thunderRumble: true,
      dischargeClick: true,
      soundVolume: 0.7,
      proximityAlert: false,
      proximityRadius: 25,
      maxAge: 60,
      mapTheme: "google_satellite"
    };

    this.strikeStats = {
      rate: 0,
      active: 0,
      closestDistKm: null,
      closestThunderEtaSec: null
    };

    this.loadSettings();
    this.initMap();
    this.initRenderer();
    this.initRadar();
    this.bindUI();
    this.connectStream();
    this.startProximityTracker();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem("lightning_radar_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
        // Force migration from old Carto dark to Google Satellite
        if (this.settings.mapTheme === "dark" || !this.settings.mapTheme) {
          this.settings.mapTheme = "google_satellite";
          this.saveSettings();
        }
      }
    } catch (e) {}
  }

  saveSettings() {
    try {
      localStorage.setItem("lightning_radar_settings", JSON.stringify(this.settings));
    } catch (e) {}
  }

  /**
   * Initializes the Leaflet map with Google Satellite & High-Zoom Base Layers
   */
  initMap() {
    // Default to Europe center or global view
    this.map = L.map("map", {
      center: [51.5, -0.1], // London / UK default
      zoom: 6,
      minZoom: 2,
      maxZoom: 21,
      zoomControl: false
    });

    // Add Zoom Control at bottom right
    L.control.zoom({ position: "bottomright" }).addTo(this.map);

    // High-Performance Base Tile Layers with Deep Zoom Support (100% Free, No API Keys)
    this.baseLayers = {
      // Google Satellite Hybrid (Imagery + Labels/Roads)
      google_satellite: L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
        subdomains: ["0", "1", "2", "3"],
        attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
        maxNativeZoom: 20,
        maxZoom: 21
      }),
      // Google Satellite Pure (Imagery Only)
      google_pure: L.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        subdomains: ["0", "1", "2", "3"],
        attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
        maxNativeZoom: 20,
        maxZoom: 21
      }),
      // Google Terrain / Relief
      google_terrain: L.tileLayer("https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
        subdomains: ["0", "1", "2", "3"],
        attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
        maxNativeZoom: 20,
        maxZoom: 21
      }),
      // Google Standard Roads
      google_streets: L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
        subdomains: ["0", "1", "2", "3"],
        attribution: '&copy; <a href="https://maps.google.com">Google Maps</a>',
        maxNativeZoom: 20,
        maxZoom: 21
      }),
      // ESRI Dark Canvas (100% Free, no watermarks, no API key)
      dark: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
        maxNativeZoom: 16,
        maxZoom: 21
      }),
      // OpenStreetMap Standard
      osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxNativeZoom: 19,
        maxZoom: 21
      })
    };

    // Apply initial base layer (Default: Google Satellite)
    const initialTheme = this.baseLayers[this.settings.mapTheme] ? this.settings.mapTheme : "google_satellite";
    this.currentBaseLayer = this.baseLayers[initialTheme];
    this.currentBaseLayer.addTo(this.map);

    // Dynamic viewport telemetry: update rate and active strikes as map is panned/zoomed
    this.map.on("move", () => this.updateViewportTelemetry());
    this.map.on("zoom", () => this.updateViewportTelemetry());
  }

  initRenderer() {
    const canvas = document.getElementById("lightningCanvas");
    this.renderer = new LightningCanvasRenderer(canvas, this.map);
    this.renderer.showThunderWaves = this.settings.thunderWaves;
    this.renderer.showStationRays = this.settings.stationRays;
    this.renderer.setMaxAge(this.settings.maxAge);
    this.renderer.start();
  }

  initRadar() {
    this.radar = new WeatherRadarLayer(this.map);
    this.radar.setEnabled(this.settings.radar);
    this.radar.setOpacity(this.settings.radarOpacity);
    this.radar.init();
  }

  /**
   * Connects to backend WebSocket or falls back to direct client connection
   */
  connectStream() {
    const statusBadge = document.getElementById("statusBadge");
    const statusDot = statusBadge.querySelector(".status-dot");
    const statusText = document.getElementById("statusText");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const localWsUrl = `${protocol}//${window.location.host}/ws`;

    // Try local backend proxy first
    this.connectWebSocket(localWsUrl, () => {
      // If local server fails, try direct upstream
      console.warn("Backend WS unreachable. Falling back to direct upstream connection...");
      this.connectDirectUpstream();
    });
  }

  connectWebSocket(url, onFallback) {
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.getElementById("statusText");

    statusDot.className = "status-dot";
    statusText.textContent = "CONNECTING";

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        statusDot.className = "status-dot live";
        statusText.textContent = "LIVE";
        this.showToast("⚡ Connected to Live Lightning Stream");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "strokes" && msg.data) {
            this.handleIncomingStrokes(msg.data);
          } else if (msg.type === "init" && msg.data) {
            if (msg.data.strokes) {
              this.renderer.addStrokes(msg.data.strokes);
              this.updateViewportTelemetry();
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => {
        statusDot.className = "status-dot error";
        statusText.textContent = "DISCONNECTED";
        if (onFallback) {
          onFallback();
        } else {
          setTimeout(() => this.connectStream(), 3000);
        }
      };

      this.ws.onerror = () => {
        if (this.ws) this.ws.close();
      };
    } catch (e) {
      if (onFallback) onFallback();
    }
  }

  /**
   * Direct upstream client fallback if running without backend server
   */
  connectDirectUpstream() {
    const directUrl = "wss://live.lightningmaps.org/";
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.getElementById("statusText");

    try {
      this.ws = new WebSocket(directUrl);
      this.ws.onopen = () => {
        statusDot.className = "status-dot live";
        statusText.textContent = "LIVE (DIRECT)";
        const bounds = this.map.getBounds();
        const initPayload = {
          v: 24,
          i: {},
          s: true,
          x: 0,
          w: 0,
          tx: 0,
          tw: 0,
          a: 7,
          z: this.map.getZoom(),
          b: true,
          h: "",
          l: 0,
          t: Math.floor(Date.now() / 1000),
          from_lightningmaps_org: true,
          p: [bounds.getNorth(), bounds.getEast(), bounds.getSouth(), bounds.getWest()],
          r: "x"
        };
        this.ws.send(JSON.stringify(initPayload));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if ("k" in data) {
            const kVal = data.k;
            const replyK = Math.floor(((kVal * 3604) % 7081) * Date.now() / 100);
            this.ws.send(JSON.stringify({ k: replyK }));
          }
          if (data.strokes && data.strokes.length > 0) {
            this.handleIncomingStrokes(data.strokes);
          }
        } catch (e) {}
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectDirectUpstream(), 3000);
      };
    } catch (e) {}
  }

  /**
   * Processes incoming real-time strikes: updates renderer, audio, proximity calculations
   */
  handleIncomingStrokes(strokes) {
    if (!strokes || strokes.length === 0) return;

    this.renderer.addStrokes(strokes);
    this.updateViewportTelemetry();

    // Audio click for newly detected strokes
    if (this.settings.soundMaster && this.settings.dischargeClick) {
      window.audioEngine.playDischargeClick();
    }

    // Check proximity if user location is known
    if (this.userLocation) {
      for (const s of strokes) {
        const distMiles = this.calculateDistance(
          this.userLocation.lat,
          this.userLocation.lng,
          s.lat,
          s.lon
        );

        // Schedule thunder sound when acoustic wave arrives at user (< 25 miles)
        if (this.settings.soundMaster && this.settings.thunderRumble && distMiles <= 25) {
          // Speed of sound in air: 1,125.33 ft/s (approx 4.69 sec per mile)
          const arrivalDelaySec = (distMiles * 5280) / 1125.33;
          setTimeout(() => {
            window.audioEngine.playThunderRumble(distMiles);
          }, arrivalDelaySec * 1000);
        }

        // Proximity Warning
        if (this.settings.proximityAlert && distMiles <= this.settings.proximityRadius) {
          window.audioEngine.playProximityAlert();
          const formatted = this.formatImperialDistance(distMiles);
          this.showToast(`⚠️ Strike detected ${formatted.val} ${formatted.unit} from your location!`);
        }
      }
    }
  }

  /**
   * Calculates active strikes and 1-minute strike rate specifically within the visible map viewport
   */
  updateViewportTelemetry() {
    if (!this.map || !this.renderer) return;

    const bounds = this.map.getBounds();
    const now = Date.now();
    let visibleActive = 0;
    let visibleRate1m = 0;

    const strokes = this.renderer.strokes;
    const len = strokes.length;

    for (let i = 0; i < len; i++) {
      const s = strokes[i];
      if (bounds.contains([s.lat, s.lon])) {
        visibleActive++;
        if (now - s.time <= 60000) {
          visibleRate1m++;
        }
      }
    }

    document.getElementById("activeStrikesVal").textContent = visibleActive;
    document.getElementById("strikeRateVal").textContent = visibleRate1m;
  }

  /**
   * Formats distance in imperial units: feet (<0.1 mi), yards (<0.5 mi), or miles.
   */
  formatImperialDistance(miles) {
    if (miles < 0.1) {
      const feet = Math.round(miles * 5280);
      return { val: feet, unit: "ft" };
    } else if (miles < 0.5) {
      const yards = Math.round(miles * 1760);
      return { val: yards, unit: "yd" };
    } else if (miles < 10) {
      return { val: miles.toFixed(1), unit: "mi" };
    } else {
      return { val: Math.round(miles), unit: "mi" };
    }
  }

  /**
   * Periodic tracker calculating closest strike distance and updating telemetry
   */
  startProximityTracker() {
    setInterval(() => {
      this.updateViewportTelemetry();

      if (!this.userLocation || this.renderer.strokes.length === 0) {
        document.getElementById("closestDistVal").textContent = "--";
        document.getElementById("closestUnit").textContent = "mi";
        document.getElementById("thunderEta").style.display = "none";
        return;
      }

      const now = Date.now();
      let closestDist = Infinity;
      let closestStroke = null;

      // Find closest strike within the last 15 minutes
      for (const s of this.renderer.strokes) {
        if (now - s.time > 15 * 60 * 1000) continue;
        const d = this.calculateDistance(this.userLocation.lat, this.userLocation.lng, s.lat, s.lon);
        if (d < closestDist) {
          closestDist = d;
          closestStroke = s;
        }
      }

      if (closestDist < 500) {
        const formatted = this.formatImperialDistance(closestDist);
        document.getElementById("closestDistVal").textContent = formatted.val;
        document.getElementById("closestUnit").textContent = formatted.unit;

        // Thunder ETA
        if (closestStroke) {
          const elapsedSec = (now - closestStroke.time) / 1000;
          const totalTransitSec = (closestDist * 5280) / 1125.33;
          const remainingSec = Math.max(0, Math.round(totalTransitSec - elapsedSec));

          const etaEl = document.getElementById("thunderEta");
          if (remainingSec > 0 && remainingSec < 120) {
            etaEl.textContent = `⚡ ETA: ${remainingSec}s`;
            etaEl.style.display = "inline";
          } else {
            etaEl.style.display = "none";
          }
        }
      } else {
        document.getElementById("closestDistVal").textContent = "--";
        document.getElementById("closestUnit").textContent = "mi";
        document.getElementById("thunderEta").style.display = "none";
      }
    }, 1000);
  }

  updateStatsDisplay(stats) {
    if (stats.strikes_last_minute !== undefined) {
      document.getElementById("strikeRateVal").textContent = stats.strikes_last_minute;
    }
  }

  /**
   * Haversine formula for calculating distance between two coordinates in miles
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Geolocation Handler
   */
  locateUser() {
    if (!navigator.geolocation) {
      this.showToast("Geolocation is not supported by your browser");
      return;
    }

    this.showToast("Locating your position...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        this.userLocation = { lat: latitude, lng: longitude };

        if (this.userMarker) this.map.removeLayer(this.userMarker);
        if (this.userAccuracyCircle) this.map.removeLayer(this.userAccuracyCircle);

        // Custom pulsing location marker
        const pulseIcon = L.divIcon({
          className: "user-pulse-marker",
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        this.userMarker = L.marker([latitude, longitude], { icon: pulseIcon }).addTo(this.map);
        this.userAccuracyCircle = L.circle([latitude, longitude], {
          radius: accuracy,
          color: "rgba(56, 189, 248, 0.4)",
          fillColor: "rgba(56, 189, 248, 0.08)",
          fillOpacity: 0.2,
          weight: 1
        }).addTo(this.map);

        this.map.setView([latitude, longitude], 8, { animate: true });
        this.showToast("Location updated");
      },
      (err) => {
        this.showToast(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /**
   * UI Event Bindings
   */
  bindUI() {
    // Menu Drawer
    const drawer = document.getElementById("settingsDrawer");
    const menuBtn = document.getElementById("menuToggleBtn");
    const closeDrawerBtn = document.getElementById("closeDrawerBtn");

    menuBtn.addEventListener("click", () => drawer.classList.toggle("open"));
    closeDrawerBtn.addEventListener("click", () => drawer.classList.remove("open"));

    // Sound Toggle Header Button
    const soundBtn = document.getElementById("soundToggleBtn");
    const toggleSoundMaster = document.getElementById("toggleSoundMaster");

    const updateSoundUI = (enabled) => {
      this.settings.soundMaster = enabled;
      toggleSoundMaster.checked = enabled;
      window.audioEngine.setEnabled(enabled);
      soundBtn.classList.toggle("active", enabled);
      soundBtn.innerHTML = enabled
        ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>`
        : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>`;
      this.saveSettings();
    };

    soundBtn.addEventListener("click", () => {
      window.audioEngine.unlock();
      updateSoundUI(!this.settings.soundMaster);
      this.showToast(this.settings.soundMaster ? "🔊 Thunder Audio Enabled" : "🔇 Audio Muted");
    });

    toggleSoundMaster.addEventListener("change", (e) => {
      window.audioEngine.unlock();
      updateSoundUI(e.target.checked);
    });

    // Locate Me
    document.getElementById("locateBtn").addEventListener("click", () => this.locateUser());

    // Fullscreen
    document.getElementById("fullscreenBtn").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Visual Layer Toggles
    const toggleWaves = document.getElementById("toggleThunderWaves");
    toggleWaves.checked = this.settings.thunderWaves;
    toggleWaves.addEventListener("change", (e) => {
      this.settings.thunderWaves = e.target.checked;
      this.renderer.showThunderWaves = e.target.checked;
      this.saveSettings();
    });

    const toggleRays = document.getElementById("toggleStationRays");
    toggleRays.checked = this.settings.stationRays;
    toggleRays.addEventListener("change", (e) => {
      this.settings.stationRays = e.target.checked;
      this.renderer.showStationRays = e.target.checked;
      this.saveSettings();
    });

    const toggleRadar = document.getElementById("toggleRadar");
    toggleRadar.checked = this.settings.radar;
    toggleRadar.addEventListener("change", (e) => {
      this.settings.radar = e.target.checked;
      this.radar.setEnabled(e.target.checked);
      this.saveSettings();
    });

    const radarOpacitySlider = document.getElementById("radarOpacitySlider");
    const radarOpacityVal = document.getElementById("radarOpacityVal");
    radarOpacitySlider.value = this.settings.radarOpacity * 100;
    radarOpacityVal.textContent = `${Math.round(this.settings.radarOpacity * 100)}%`;
    radarOpacitySlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10) / 100;
      this.settings.radarOpacity = val;
      radarOpacityVal.textContent = `${e.target.value}%`;
      this.radar.setOpacity(val);
      this.saveSettings();
    });

    // Strike Duration Filter
    const pillBtns = document.querySelectorAll(".pill-btn");
    pillBtns.forEach((btn) => {
      if (parseInt(btn.dataset.age, 10) === this.settings.maxAge) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
      btn.addEventListener("click", () => {
        pillBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const age = parseInt(btn.dataset.age, 10);
        this.settings.maxAge = age;
        this.renderer.setMaxAge(age);
        this.updateViewportTelemetry();
        this.saveSettings();
      });
    });

    // Audio Engine Settings
    const toggleRumble = document.getElementById("toggleThunderRumble");
    toggleRumble.checked = this.settings.thunderRumble;
    toggleRumble.addEventListener("change", (e) => {
      this.settings.thunderRumble = e.target.checked;
      window.audioEngine.thunderEnabled = e.target.checked;
      this.saveSettings();
    });

    const toggleClick = document.getElementById("toggleDischargeClick");
    toggleClick.checked = this.settings.dischargeClick;
    toggleClick.addEventListener("change", (e) => {
      this.settings.dischargeClick = e.target.checked;
      window.audioEngine.clickEnabled = e.target.checked;
      this.saveSettings();
    });

    const soundVolSlider = document.getElementById("soundVolumeSlider");
    const soundVolVal = document.getElementById("soundVolumeVal");
    soundVolSlider.value = this.settings.soundVolume * 100;
    soundVolVal.textContent = `${Math.round(this.settings.soundVolume * 100)}%`;
    soundVolSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10) / 100;
      this.settings.soundVolume = val;
      soundVolVal.textContent = `${e.target.value}%`;
      window.audioEngine.setVolume(val);
      this.saveSettings();
    });

    document.getElementById("testAudioBtn").addEventListener("click", () => {
      window.audioEngine.unlock();
      window.audioEngine.setEnabled(true);
      window.audioEngine.playDischargeClick();
      setTimeout(() => window.audioEngine.playThunderRumble(3), 300);
      this.showToast("Playing synthesized thunder preview");
    });

    // Proximity Alert
    const toggleProx = document.getElementById("toggleProximityAlert");
    toggleProx.checked = this.settings.proximityAlert;
    toggleProx.addEventListener("change", (e) => {
      this.settings.proximityAlert = e.target.checked;
      this.saveSettings();
      if (e.target.checked && !this.userLocation) {
        this.locateUser();
      }
    });

    const proxRadiusSlider = document.getElementById("proximityRadiusSlider");
    const proxRadiusVal = document.getElementById("proximityRadiusVal");
    proxRadiusSlider.value = this.settings.proximityRadius;
    proxRadiusVal.textContent = `${this.settings.proximityRadius} mi`;
    proxRadiusSlider.addEventListener("input", (e) => {
      this.settings.proximityRadius = parseInt(e.target.value, 10);
      proxRadiusVal.textContent = `${e.target.value} mi`;
      this.saveSettings();
    });

    // Map Theme Switcher
    const themeBtns = document.querySelectorAll(".theme-btn");
    themeBtns.forEach((btn) => {
      if (btn.dataset.theme === this.settings.mapTheme) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }

      btn.addEventListener("click", () => {
        themeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const theme = btn.dataset.theme;
        this.settings.mapTheme = theme;

        if (this.currentBaseLayer) {
          this.map.removeLayer(this.currentBaseLayer);
        }
        this.currentBaseLayer = this.baseLayers[theme] || this.baseLayers.dark;
        this.currentBaseLayer.addTo(this.map);
        this.saveSettings();
      });
    });

    // PWA Install Prompt Support
    let deferredPrompt = null;
    const installBtn = document.getElementById("pwaInstallBtn");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.style.display = "block";
    });

    installBtn.addEventListener("click", async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          installBtn.style.display = "none";
        }
        deferredPrompt = null;
      }
    });
  }

  showToast(message, duration = 3000) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }
}

// Bootstrap application on page load
window.addEventListener("DOMContentLoaded", () => {
  window.app = new LightningApp();
});
