/**
 * Lightning Radar — High-Performance 60 FPS HTML5 Canvas Overlay Engine
 * Renders thousands of lightning strokes, expanding acoustic thunder waves, and detector rays.
 */

class LightningCanvasRenderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = map;

    // Visual options
    this.showThunderWaves = true;
    this.showStationRays = true;
    this.maxAgeMinutes = 60;
    this.speedOfSound = 343; // meters per second

    // Data buffers
    this.strokes = []; // Active strokes array
    this.recentNewStrokes = []; // Strokes < 150 seconds old (for active acoustic wave animation)

    // Device Pixel Ratio for Retina / High-DPI screens
    this.dpr = window.devicePixelRatio || 1;

    // Animation loop state
    this.isRunning = false;
    this.animationFrameId = null;

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    this.resize();
  }

  resize() {
    const rect = this.map.getContainer().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.map.on("move", () => this.render());
    this.map.on("zoom", () => this.render());
    this.map.on("resize", () => this.resize());
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  loop() {
    if (!this.isRunning) return;
    this.render();
    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  /**
   * Adds a batch of incoming strikes from the stream.
   * @param {Array} newStrokes 
   */
  addStrokes(newStrokes) {
    const now = Date.now();
    for (const s of newStrokes) {
      this.strokes.push(s);
      if (now - s.time < 120000) {
        this.recentNewStrokes.push(s);
      }
    }
    this.pruneOldStrokes();
  }

  pruneOldStrokes() {
    const now = Date.now();
    const cutoff = now - this.maxAgeMinutes * 60 * 1000;
    
    // Prune main stroke buffer
    this.strokes = this.strokes.filter(s => s.time >= cutoff);

    // Prune recent wave animation buffer (< 120s)
    const waveCutoff = now - 120000;
    this.recentNewStrokes = this.recentNewStrokes.filter(s => s.time >= waveCutoff);
  }

  setMaxAge(minutes) {
    this.maxAgeMinutes = minutes;
    this.pruneOldStrokes();
  }

  /**
   * Main 60 FPS Render Routine
   */
  render() {
    const ctx = this.ctx;
    const now = Date.now();
    const bounds = this.map.getBounds().pad(0.2); // 20% viewport padding for off-screen culling
    const mapZoom = this.map.getZoom();

    // Clear Canvas
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw Station Triangulation Rays (< 3 seconds old)
    if (this.showStationRays) {
      this.renderStationRays(ctx, now, bounds);
    }

    // 2. Draw Expanding Acoustic Thunder Shockwaves
    if (this.showThunderWaves) {
      this.renderThunderWaves(ctx, now, bounds, mapZoom);
    }

    // 3. Draw All Lightning Strikes with Age Decay
    this.renderStrokes(ctx, now, bounds, mapZoom);
  }

  /**
   * Draws station rays for fresh strikes
   */
  renderStationRays(ctx, now, bounds) {
    const rayDuration = 2500; // ms
    ctx.lineWidth = 1;

    for (let i = this.recentNewStrokes.length - 1; i >= 0; i--) {
      const s = this.recentNewStrokes[i];
      const age = now - s.time;
      if (age > rayDuration || !s.sta) continue;

      const strikeLatLng = L.latLng(s.lat, s.lon);
      if (!bounds.contains(strikeLatLng)) continue;

      const strikePt = this.map.latLngToContainerPoint(strikeLatLng);
      const alpha = (1 - age / rayDuration) * 0.45;

      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.beginPath();

      const stationIds = Object.keys(s.sta);
      for (const id of stationIds) {
        let stationPos = window.stationRegistry ? window.stationRegistry.getStationPos(id) : null;
        
        if (stationPos) {
          const stLatLng = L.latLng(stationPos[0], stationPos[1]);
          const stPt = this.map.latLngToContainerPoint(stLatLng);
          ctx.moveTo(strikePt.x, strikePt.y);
          ctx.lineTo(stPt.x, stPt.y);
        } else {
          // If station coords not available, project a short aesthetic ray
          const angle = (parseInt(id, 10) * 45) % 360;
          const rad = (angle * Math.PI) / 180;
          const rayLen = 40;
          ctx.moveTo(strikePt.x, strikePt.y);
          ctx.lineTo(strikePt.x + Math.cos(rad) * rayLen, strikePt.y + Math.sin(rad) * rayLen);
        }
      }
      ctx.stroke();
    }
  }

  /**
   * Draws expanding concentric acoustic sound waves
   */
  renderThunderWaves(ctx, now, bounds, zoom) {
    const maxWaveAge = 120000; // 2 minutes (approx 41 km reach)

    for (let i = this.recentNewStrokes.length - 1; i >= 0; i--) {
      const s = this.recentNewStrokes[i];
      const ageMs = now - s.time;
      if (ageMs < 0 || ageMs > maxWaveAge) continue;

      const strikeLatLng = L.latLng(s.lat, s.lon);
      if (!bounds.contains(strikeLatLng)) continue;

      const pt = this.map.latLngToContainerPoint(strikeLatLng);
      
      // Radius in meters = speed of sound (343 m/s) * elapsed seconds
      const elapsedSec = ageMs / 1000;
      const radiusMeters = this.speedOfSound * elapsedSec;

      // Convert meters to screen pixels at the strike's latitude
      const latRad = (s.lat * Math.PI) / 180;
      const metersPerPixel = (40075016.686 * Math.cos(latRad)) / (256 * Math.pow(2, zoom));
      const radiusPixels = radiusMeters / metersPerPixel;

      if (radiusPixels < 2 || radiusPixels > this.width * 2) continue;

      // Fading opacity over wave lifetime
      const progress = ageMs / maxWaveAge;
      const alpha = Math.max(0, (1 - progress) * 0.7);

      // Primary shockwave ring
      ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
      ctx.lineWidth = Math.max(1, 2.5 - progress * 1.5);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radiusPixels, 0, Math.PI * 2);
      ctx.stroke();

      // Secondary echo ring (slightly inner)
      if (radiusPixels > 15) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, radiusPixels - 8), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /**
   * Draws all strike dots with age decay and flashing glow for fresh strikes
   */
  renderStrokes(ctx, now, bounds, zoom) {
    const baseRadius = Math.max(2, Math.min(5, zoom * 0.45));

    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      const latLng = L.latLng(s.lat, s.lon);

      // Viewport culling
      if (!bounds.contains(latLng)) continue;

      const pt = this.map.latLngToContainerPoint(latLng);
      const ageMs = now - s.time;
      const ageMin = ageMs / 60000;

      // Color ramp calculation
      let color = "#7c3aed"; // Default old (>60m)
      let alpha = 0.85;

      if (ageMs < 3000) {
        // Flash white with radiant glow for first 3 seconds
        color = "#ffffff";
        const flashPhase = (now % 300) / 300;
        const glowRadius = baseRadius * (2.5 + Math.sin(flashPhase * Math.PI) * 1.5);
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (ageMin < 1) {
        color = "#ffffff";
      } else if (ageMin < 5) {
        color = "#ffd700"; // Yellow
      } else if (ageMin < 20) {
        color = "#ff8c00"; // Orange
      } else if (ageMin < 60) {
        color = "#dc2626"; // Red
      } else {
        color = "#7c3aed"; // Purple/Fade
        alpha = Math.max(0.2, 1 - (ageMin - 60) / 60);
      }

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Subtle stroke border for contrast
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }
}

window.LightningCanvasRenderer = LightningCanvasRenderer;
