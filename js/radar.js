/**
 * Lightning Radar — RainViewer Live Weather Radar Overlay
 * Fetches real-time global precipitation radar frames and overlays on Leaflet.
 */

class WeatherRadarLayer {
  constructor(map) {
    this.map = map;
    this.radarLayer = null;
    this.enabled = true;
    this.opacity = 0.65;
    this.radarHost = "https://tilecache.rainviewer.com";
    this.latestFramePath = null;
    this.refreshTimer = null;
  }

  initPane() {
    if (!this.map.getPane("radarPane")) {
      const pane = this.map.createPane("radarPane");
      pane.style.zIndex = "350"; // Above base map (200), below canvas (400)
      pane.style.pointerEvents = "none";
    }
  }

  async init() {
    this.initPane();
    await this.fetchLatestRadarFrame();
    // Auto-refresh radar frame every 3 minutes
    this.refreshTimer = setInterval(() => this.fetchLatestRadarFrame(), 3 * 60 * 1000);
  }

  async fetchLatestRadarFrame() {
    try {
      const resp = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!resp.ok) return;
      const data = await resp.json();

      if (data.host) this.radarHost = data.host;
      if (data.radar && data.radar.past && data.radar.past.length > 0) {
        // Get the most recent past radar frame
        const latest = data.radar.past[data.radar.past.length - 1];
        this.latestFramePath = latest.path;
        this.updateLayer();
      }
    } catch (e) {
      console.warn("Could not fetch RainViewer radar frames:", e);
    }
  }

  updateLayer() {
    if (!this.latestFramePath) return;
    this.initPane();

    if (this.radarLayer) {
      this.map.removeLayer(this.radarLayer);
      this.radarLayer = null;
    }

    if (this.enabled) {
      // 2 = Universal radar color palette, 1_1 = smoothed with snow distinction
      const tileUrl = `${this.radarHost}${this.latestFramePath}/256/{z}/{x}/{y}/2/1_1.png`;
      this.radarLayer = L.tileLayer(tileUrl, {
        pane: "radarPane",
        opacity: this.opacity,
        tileSize: 256,
        minZoom: 2,
        maxNativeZoom: 7, // RainViewer serves tiles up to level 7
        maxZoom: 21,      // Leaflet upscales Zoom 7 tiles seamlessly up to Zoom 21
        attribution: '&copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>'
      });
      this.radarLayer.addTo(this.map);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.radarLayer) {
      if (enabled) {
        if (!this.map.hasLayer(this.radarLayer)) {
          this.map.addLayer(this.radarLayer);
        }
      } else {
        this.map.removeLayer(this.radarLayer);
      }
    } else if (enabled) {
      this.updateLayer();
    }
  }

  setOpacity(val) {
    this.opacity = val;
    if (this.radarLayer) {
      this.radarLayer.setOpacity(val);
    }
  }
}

window.WeatherRadarLayer = WeatherRadarLayer;
