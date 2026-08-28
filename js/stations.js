/**
 * Lightning Radar — Detector Station Registry
 * Maps Blitzortung station IDs to approximate/known geographic coordinates for ray drawing.
 */

class StationRegistry {
  constructor() {
    this.stations = new Map();
    this.loaded = false;
  }

  async init() {
    // Try to load cached station list from backend if available
    try {
      const resp = await fetch("/api/stations");
      if (resp.ok) {
        const data = await resp.json();
        for (const [id, s] of Object.entries(data)) {
          this.stations.set(String(id), [s.lat, s.lon]);
        }
        this.loaded = true;
      }
    } catch (e) {
      // Backend not running station API or running in client-direct mode
    }
  }

  getStationPos(id) {
    return this.stations.get(String(id)) || null;
  }

  addStation(id, lat, lon) {
    this.stations.set(String(id), [lat, lon]);
  }
}

window.stationRegistry = new StationRegistry();
