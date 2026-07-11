// src/lib/sfx.ts

class SoundEffects {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  
  private activeTheme: 'none' | 'glass' | 'modern' | 'retro' | 'cinematic' = 'glass';

  
  public setTheme(theme: 'none' | 'glass' | 'modern' | 'retro' | 'cinematic') {
    this.activeTheme = theme;
  }

  private getCtx() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  private playTone(freq: number, type: OscillatorType, dur: number, vol: number) {
    if (this.muted) return;
    const c = this.getCtx();
    if (!c || !this.masterGain) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + dur * 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }

  private playGlass({ freq = 880, dur = 0.5, vol = 0.05, modRatio = 2.76, modDepth = 6 }) {
    if (this.muted) return;
    const c = this.getCtx();
    if (!c || !this.masterGain) return;
    const t0 = c.currentTime;
    const carrier = c.createOscillator();
    const modulator = c.createOscillator();
    const modGain = c.createGain();
    const filter = c.createBiquadFilter();
    const amp = c.createGain();
    carrier.type = "sine";
    carrier.frequency.setValueAtTime(freq, t0);
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(freq * modRatio, t0);
    modGain.gain.setValueAtTime(modDepth, t0);
    modGain.gain.exponentialRampToValueAtTime(0.01, t0 + dur * 0.6);
    modulator.connect(modGain).connect(carrier.frequency);
    filter.type = "lowpass";
    filter.frequency.value = 4000;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    carrier.connect(filter).connect(amp).connect(this.masterGain);
    carrier.start(t0); modulator.start(t0);
    carrier.stop(t0 + dur); modulator.stop(t0 + dur);
  }

  navigate(dir: "up" | "down" | "left" | "right", soundType: 'light' | 'movie' = 'light') {
    if (this.activeTheme === 'none') return; 
    
    const up = dir === "up" || dir === "left";
    
    if (this.activeTheme === 'modern') {
      if (soundType === 'light') this.playTone(420, 'sine', 0.03, 0.03); 
      else this.playTone(310, 'sine', 0.04, 0.045); 
      return;
    }

    if (this.activeTheme === 'glass') {
      if (soundType === 'light') this.playGlass({ freq: 2000, dur: 0.08, vol: 0.012 });
      else this.playGlass({ freq: up ? 980 : 1120, dur: 0.22, vol: 0.03 });
    } 
    else if (this.activeTheme === 'retro') {
      this.playTone(soundType === 'light' ? 600 : 440, 'square', 0.06, 0.012);
    }
    else if (this.activeTheme === 'cinematic') {
      this.playTone(soundType === 'light' ? 250 : 130, 'triangle', 0.2, 0.04);
    }
  }

  open() {
    if (this.activeTheme === 'none') return; 
    
    if (this.activeTheme === 'glass') this.playGlass({ freq: 720, dur: 0.5, vol: 0.04, modRatio: 3 });
    else if (this.activeTheme === 'modern') {
      this.playTone(523.25, 'sine', 0.3, 0.03); 
      this.playTone(659.25, 'sine', 0.3, 0.025); 
      this.playTone(783.99, 'sine', 0.3, 0.02); 
    }
    else if (this.activeTheme === 'retro') this.playTone(880, 'square', 0.2, 0.02);
    else if (this.activeTheme === 'cinematic') {
      this.playTone(75, 'sine', 0.7, 0.08); 
      this.playTone(280, 'triangle', 0.5, 0.03);
    }
  }

  close() {
    if (this.activeTheme === 'none') return; 
    
    if (this.activeTheme === 'glass') this.playGlass({ freq: 560, dur: 0.3, vol: 0.03 });
    else if (this.activeTheme === 'modern') {
      this.playTone(392.00, 'sine', 0.22, 0.03); 
      this.playTone(329.63, 'sine', 0.22, 0.02); 
    }
    else if (this.activeTheme === 'retro') this.playTone(440, 'square', 0.18, 0.02);
    else if (this.activeTheme === 'cinematic') this.playTone(90, 'sine', 0.4, 0.05);
  }

  hover() {
    if (this.activeTheme === 'none') return; 
    
    if (this.activeTheme === 'glass') this.playGlass({ freq: 2200, dur: 0.05, vol: 0.015 });
    else if (this.activeTheme === 'modern') this.playTone(1200, 'sine', 0.015, 0.01);
    else if (this.activeTheme === 'retro') this.playTone(1000, 'sawtooth', 0.02, 0.004);
    else if (this.activeTheme === 'cinematic') this.playTone(350, 'sine', 0.04, 0.01);
  }

  click() {
    if (this.activeTheme === 'none') return; 
    
    if (this.activeTheme === 'glass') this.playGlass({ freq: 1500, dur: 0.08, vol: 0.04 });
    else if (this.activeTheme === 'modern') this.playTone(400, 'sine', 0.05, 0.035);
    else if (this.activeTheme === 'retro') this.playTone(550, 'square', 0.07, 0.015);
    else if (this.activeTheme === 'cinematic') this.playTone(180, 'triangle', 0.12, 0.04);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 0.5;
  }

  init() {
    if (this.activeTheme === 'none') return; // عدم تهيئة الصوت إذا كان معطلاً
    this.getCtx();
  }
}

export const SFX = new SoundEffects();
