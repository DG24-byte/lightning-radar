/**
 * Lightning Radar — Web Audio API Synthesizer
 * Generates realistic distance-attenuated thunder rumbles, static clicks, and proximity alerts.
 */

class LightningAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = false;
    this.thunderEnabled = true;
    this.clickEnabled = true;
    this.volume = 0.7;
    this.lastClickTime = 0;
  }

  /**
   * Initializes the AudioContext upon first user interaction (browser policy requirement).
   */
  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Web Audio API not supported on this browser:", e);
    }
  }

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Plays a subtle electromagnetic discharge click when a new strike is detected.
   */
  playDischargeClick() {
    if (!this.enabled || !this.clickEnabled || !this.ctx) return;
    const now = Date.now();
    // Rate limit clicks to prevent sound saturation during storms
    if (now - this.lastClickTime < 60) return;
    this.lastClickTime = now;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // High click sound mimicking radio sferics
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200 + Math.random() * 800, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.025);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1500, t);
      filter.Q.setValueAtTime(3, t);

      gain.gain.setValueAtTime(0.12 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.035);
    } catch (e) {}
  }

  /**
   * Synthesizes a deep resonant thunder rumble when the acoustic shockwave reaches the listener.
   * @param {number} distanceMiles Distance to strike in miles
   */
  playThunderRumble(distanceMiles = 3) {
    if (!this.enabled || !this.thunderEnabled || !this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      // Duration & intensity scaled by distance
      const duration = Math.min(5.0, 1.8 + Math.random() * 2.0);
      const bufferSize = this.ctx.sampleRate * duration;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // Generate brownian/pink noise (integrated white noise) for low-end rumble
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // Gain compensation
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      // Cascading low-pass filters for subterranean rumble feel
      const lpFilter1 = this.ctx.createBiquadFilter();
      lpFilter1.type = "lowpass";
      const cutoff = Math.max(50, 220 - distanceMiles * 6);
      lpFilter1.frequency.setValueAtTime(cutoff, t);
      lpFilter1.Q.setValueAtTime(4.0, t);

      const gain = this.ctx.createGain();
      
      // Distance attenuation formula (scaled for miles)
      const distAttenuation = Math.max(0.1, 1 / (1 + distanceMiles * 0.12));
      const peakVol = 0.8 * distAttenuation * this.volume;

      // Thunder envelope: quick rise, multi-peaked reverberation, long rolling decay
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(peakVol, t + 0.15);
      gain.gain.setTargetAtTime(peakVol * 0.7, t + 0.4, 0.3);
      gain.gain.setTargetAtTime(peakVol * 0.4, t + 1.2, 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(lpFilter1);
      lpFilter1.connect(gain);
      gain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + duration);
    } catch (e) {
      console.warn("Thunder playback error:", e);
    }
  }

  /**
   * Plays a warning chime for nearby strikes within user's configured safety perimeter.
   */
  playProximityAlert() {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t); // A5
      osc.frequency.setValueAtTime(1174.66, t + 0.12); // D6

      gain.gain.setValueAtTime(0.25 * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.5);
    } catch (e) {}
  }
}

window.audioEngine = new LightningAudioEngine();
