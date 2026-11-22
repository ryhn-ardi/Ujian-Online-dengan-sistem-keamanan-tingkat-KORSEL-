import { ExamConfig } from '../types';

let sharedAudioContext: AudioContext | null = null;
let currentPlayingAudio: HTMLAudioElement | null = null;
let unlockedAlarmAudioEl: HTMLAudioElement | null = null;
let isAudioElementUnlocked = false;
let activeAlarmStopTimer: ReturnType<typeof setTimeout> | null = null;
let activeOscillators: OscillatorNode[] = [];

const generatedAlarmWavUrlCache: Record<string, string> = {};

// Ultra-short 1-frame silent PCM WAV data URI used solely to unlock mobile HTMLAudioElement inside a user tap
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export const CUSTOM_ALARM_STORAGE_KEY = 'proktor_custom_alarm_audio';
export const CUSTOM_ANNOUNCEMENT_STORAGE_KEY = 'proktor_custom_announcement_audio';

let inMemoryCustomAlarmAudio: string | null = null;
let inMemoryCustomAnnouncementAudio: string | null = null;

export function setCustomAlarmAudioData(data: string | null) {
  inMemoryCustomAlarmAudio = data;
  try {
    if (data) {
      localStorage.setItem(CUSTOM_ALARM_STORAGE_KEY, data);
    } else {
      localStorage.removeItem(CUSTOM_ALARM_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('LocalStorage error storing custom alarm audio:', e);
  }
}

export function getCustomAlarmAudioData(): string | null {
  if (inMemoryCustomAlarmAudio) return inMemoryCustomAlarmAudio;
  try {
    const stored = localStorage.getItem(CUSTOM_ALARM_STORAGE_KEY);
    if (stored) {
      inMemoryCustomAlarmAudio = stored;
      return stored;
    }
  } catch (e) {}
  return null;
}

export function setCustomAnnouncementAudioData(data: string | null) {
  inMemoryCustomAnnouncementAudio = data;
  try {
    if (data) {
      localStorage.setItem(CUSTOM_ANNOUNCEMENT_STORAGE_KEY, data);
    } else {
      localStorage.removeItem(CUSTOM_ANNOUNCEMENT_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('LocalStorage error storing custom announcement audio:', e);
  }
}

export function getCustomAnnouncementAudioData(): string | null {
  if (inMemoryCustomAnnouncementAudio) return inMemoryCustomAnnouncementAudio;
  try {
    const stored = localStorage.getItem(CUSTOM_ANNOUNCEMENT_STORAGE_KEY);
    if (stored) {
      inMemoryCustomAnnouncementAudio = stored;
      return stored;
    }
  } catch (e) {}
  return null;
}

/**
 * Generates an in-memory 16-bit Mono PCM WAV Blob URL for built-in alarms.
 * Used with a pre-unlocked HTMLAudioElement so mobile browsers (Android Chrome / iOS Safari)
 * still ring loudly when Quick Settings / Notification Shade suspends Web Audio AudioContext.
 */
export function generateAlarmWavUrl(alarmType: string = 'SIREN', durationSec = 4.0): string | null {
  const key = `${alarmType}_${durationSec}`;
  if (generatedAlarmWavUrlCache[key]) {
    return generatedAlarmWavUrlCache[key];
  }

  if (typeof window === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  try {
    const sampleRate = 16000;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const dataSize = totalSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // Standard RIFF/WAVE PCM header
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format = 1
    view.setUint16(22, 1, true); // Channels = 1
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const saw = (phase: number) => 2 * (phase - Math.floor(phase)) - 1;
    const square = (phase: number) => ((phase - Math.floor(phase)) < 0.5 ? 1 : -1);

    let phase1 = 0;
    let phase2 = 0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Envelope to avoid start/end click
      const fadeIn = Math.min(1, t / 0.04);
      const fadeOut = Math.min(1, (durationSec - t) / 0.15);
      const env = Math.max(0, Math.min(fadeIn, fadeOut));

      if (alarmType === 'BUZZER') {
        const pulse = Math.sin(2 * Math.PI * 8 * t) >= 0 ? 1 : 0.05;
        phase1 += 480 / sampleRate;
        sample = square(phase1) * pulse * 0.85;
      } else if (alarmType === 'NUCLEAR') {
        const cycle = (t % 2.0) / 2.0;
        const freq = cycle < 0.5
          ? 300 + 500 * (cycle * 2)
          : 800 - 500 * ((cycle - 0.5) * 2);
        phase1 += freq / sampleRate;
        sample = saw(phase1) * 0.88;
      } else if (alarmType === 'BELL') {
        const chimeCount = 6;
        const interval = durationSec / chimeCount;
        const chimeIndex = Math.floor(t / interval);
        const localT = t - chimeIndex * interval;
        const freq = chimeIndex % 2 === 0 ? 920 : 1070;
        const decay = Math.exp(-4.2 * localT);
        sample = Math.sin(2 * Math.PI * freq * localT) * decay * 0.9;
      } else if (alarmType === 'HORN') {
        const pulse = Math.sin(2 * Math.PI * 1.2 * t) >= -0.15 ? 1 : 0.05;
        phase1 += 175 / sampleRate;
        phase2 += 235 / sampleRate;
        sample = (saw(phase1) * 0.5 + square(phase2) * 0.45) * pulse;
      } else if (alarmType === 'AMBULANCE') {
        const step = Math.floor(t / 0.45);
        const freq = step % 2 === 0 ? 960 : 720;
        phase1 += freq / sampleRate;
        sample = saw(phase1) * 0.85;
      } else {
        // Default SIREN (sweeping dual pitch)
        const lfo = Math.sin(2 * Math.PI * 4.5 * t) * 180;
        phase1 += (650 + lfo) / sampleRate;
        phase2 += (850 + lfo) / sampleRate;
        sample = (saw(phase1) * 0.52 + square(phase2) * 0.42);
      }

      const clamped = Math.max(-1, Math.min(1, sample * env));
      view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    generatedAlarmWavUrlCache[key] = url;
    return url;
  } catch (e) {
    console.warn('WAV alarm generation fallback:', e);
    return null;
  }
}

function getOrCreateUnlockedAudioElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!unlockedAlarmAudioEl) {
    unlockedAlarmAudioEl = new Audio();
    unlockedAlarmAudioEl.setAttribute('playsinline', '');
    unlockedAlarmAudioEl.preload = 'auto';
  }
  return unlockedAlarmAudioEl;
}

/**
 * Unlocks HTML5 Audio element during a user gesture (tap/click) so mobile browsers
 * allow playing alarm sounds later even during window.blur or Quick Settings overlay.
 */
export function unlockAlarmAudioElement(): void {
  const el = getOrCreateUnlockedAudioElement();
  if (!el || isAudioElementUnlocked) return;
  try {
    // Only prime with silent WAV if nothing is actively playing
    if (el.paused) {
      el.src = SILENT_WAV_DATA_URI;
      el.volume = 0.01;
      const p = el.play();
      if (p !== undefined) {
        p.then(() => {
          isAudioElementUnlocked = true;
          try {
            el.pause();
            el.currentTime = 0;
            el.volume = 1.0;
          } catch (e) {}
        }).catch(() => {});
      }
    }
  } catch (e) {}
}

export function warmUpAlarmAudioContext(): AudioContext | null {
  // 1. Unlock HTMLAudioElement (survives Quick Settings / Notification shade focus steal on HP)
  unlockAlarmAudioElement();

  // 2. Also warm up & pre-generate default SIREN wav buffer in cache
  generateAlarmWavUrl('SIREN', 4.5);

  // 3. Unlock Web Audio API AudioContext
  const ctx = getAudioContext();
  if (ctx) {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {}
  }
  return ctx;
}

export function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext.state === 'suspended' || (sharedAudioContext.state as string) === 'interrupted') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (e) {
    return null;
  }
}

export function stopAllAlarmSounds() {
  if (activeAlarmStopTimer) {
    clearTimeout(activeAlarmStopTimer);
    activeAlarmStopTimer = null;
  }

  // Stop custom / WAV HTMLAudioElement if playing
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    } catch (e) {}
    currentPlayingAudio = null;
  }

  if (unlockedAlarmAudioEl && !unlockedAlarmAudioEl.paused) {
    try {
      unlockedAlarmAudioEl.pause();
      unlockedAlarmAudioEl.currentTime = 0;
    } catch (e) {}
  }

  // Stop active Web Audio oscillators
  activeOscillators.forEach((osc) => {
    try {
      osc.stop();
      osc.disconnect();
    } catch (e) {}
  });
  activeOscillators = [];
}

function playSynthByType(alarmType: string, durationSec = 5.0): { stop: () => void } {
  if (alarmType === 'BUZZER') return playBuzzerSynth(durationSec);
  if (alarmType === 'NUCLEAR') return playNuclearSynth(durationSec);
  if (alarmType === 'BELL') return playBellSynth(durationSec);
  if (alarmType === 'HORN') return playHornSynth(durationSec);
  if (alarmType === 'AMBULANCE') return playAmbulanceSynth(durationSec);
  return playSirenSynth(durationSec);
}

/**
 * Play Alarm based on config selection.
 * Uses pre-unlocked HTMLAudioElement + PCM WAV first so mobile Quick Settings / focus loss
 * never silences the alarm, with Web Audio API synth as seamless fallback.
 */
export function playAlarmSound(config?: Partial<ExamConfig>): { stop: () => void } {
  stopAllAlarmSounds();

  // Trigger physical vibration on supported mobile devices
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600]);
    } catch (e) {}
  }

  const alarmType = config?.alarmType || 'SIREN';

  // 1. CUSTOM AUDIO FILE / URL
  if (alarmType === 'CUSTOM_AUDIO') {
    const audioSource = config?.customAlarmAudioUrl || getCustomAlarmAudioData();
    if (audioSource) {
      try {
        const audio = getOrCreateUnlockedAudioElement() || new Audio();
        audio.src = audioSource;
        audio.volume = 1.0;
        currentPlayingAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Custom audio playback failed, falling back to siren:', err);
            playSirenWithResume('SIREN', 5.0);
          });
        }

        activeAlarmStopTimer = setTimeout(() => {
          if (currentPlayingAudio === audio) {
            stopAllAlarmSounds();
          }
        }, 8000);

        return {
          stop: () => stopAllAlarmSounds()
        };
      } catch (err) {
        console.warn('Audio element error, fallback to siren:', err);
      }
    }
  }

  // 2. BUILT-IN ALARM: Try pre-unlocked HTMLAudioElement with generated PCM WAV (survives mobile Quick Settings!)
  const wavUrl = generateAlarmWavUrl(alarmType, 4.5);
  const audioEl = getOrCreateUnlockedAudioElement();

  if (wavUrl && audioEl) {
    try {
      audioEl.src = wavUrl;
      audioEl.volume = 1.0;
      audioEl.currentTime = 0;
      currentPlayingAudio = audioEl;

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('HTMLAudioElement alarm blocked, falling back to Web Audio:', err);
          playSirenWithResume(alarmType, 5.0);
        });
      }

      activeAlarmStopTimer = setTimeout(() => {
        stopAllAlarmSounds();
      }, 5000);

      return {
        stop: () => stopAllAlarmSounds()
      };
    } catch (e) {
      console.warn('WAV AudioElement fallback to Web Audio:', e);
    }
  }

  // 3. Fallback directly to Web Audio API synth (awaits resume if suspended)
  return playSirenWithResume(alarmType, 5.0);
}

function playSirenWithResume(alarmType: string, durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
    ctx.resume()
      .then(() => {
        playSynthByType(alarmType, durationSec);
      })
      .catch(() => {
        playSynthByType(alarmType, durationSec);
      });
    return {
      stop: () => stopAllAlarmSounds()
    };
  }

  return playSynthByType(alarmType, durationSec);
}

/**
 * Standard Police Siren (Sweeping frequency pitch) - Original alarm sound
 */
function playSirenSynth(durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const mainGain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(650, now);
    osc2.frequency.setValueAtTime(850, now);

    lfo.frequency.setValueAtTime(4.5, now);
    lfoGain.gain.setValueAtTime(180, now);

    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);

    const oscGain1 = ctx.createGain();
    const oscGain2 = ctx.createGain();
    oscGain1.gain.setValueAtTime(0.85, now);
    oscGain2.gain.setValueAtTime(0.75, now);

    osc1.connect(oscGain1);
    osc2.connect(oscGain2);

    oscGain1.connect(mainGain);
    oscGain2.connect(mainGain);

    mainGain.connect(ctx.destination);

    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(2.2, now + 0.08);
    mainGain.gain.setValueAtTime(2.2, now + durationSec - 0.5);
    mainGain.gain.linearRampToValueAtTime(0.01, now + durationSec);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    osc1.stop(now + durationSec);
    osc2.stop(now + durationSec);
    lfo.stop(now + durationSec);

    activeOscillators.push(osc1, osc2, lfo);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Rapid Electronic Warning Buzzer
 */
function playBuzzerSynth(durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const mainGain = ctx.createGain();
    const pulseGain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(480, now);

    // Rapid pulsing square wave
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(8, now); // 8 beeps per second

    lfo.connect(pulseGain.gain);
    osc.connect(pulseGain);
    pulseGain.connect(mainGain);
    mainGain.connect(ctx.destination);

    mainGain.gain.setValueAtTime(1.8, now);
    mainGain.gain.setValueAtTime(1.8, now + durationSec - 0.2);
    mainGain.gain.linearRampToValueAtTime(0.01, now + durationSec);

    osc.start(now);
    lfo.start(now);

    osc.stop(now + durationSec);
    lfo.stop(now + durationSec);

    activeOscillators.push(osc, lfo);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Nuclear / Air Raid Siren (Slow undulating deep wail)
 */
function playNuclearSynth(durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const mainGain = ctx.createGain();

    osc.type = 'sawtooth';
    // Slowly sweep frequency up and down
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 1.8);
    osc.frequency.exponentialRampToValueAtTime(320, now + 3.2);
    osc.frequency.exponentialRampToValueAtTime(800, now + 4.5);
    osc.frequency.exponentialRampToValueAtTime(300, now + durationSec);

    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(2.0, now + 0.3);
    mainGain.gain.setValueAtTime(2.0, now + durationSec - 0.5);
    mainGain.gain.linearRampToValueAtTime(0.01, now + durationSec);

    osc.connect(mainGain);
    mainGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec);

    activeOscillators.push(osc);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Alarm Bell / Klaxon Strike
 */
function playBellSynth(durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    // Series of 6 bell chimes
    const chimeCount = 6;
    const interval = durationSec / chimeCount;

    for (let i = 0; i < chimeCount; i++) {
      const strikeTime = now + (i * interval);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(920 + (i % 2 === 0 ? 0 : 150), strikeTime);

      gain.gain.setValueAtTime(0, strikeTime);
      gain.gain.linearRampToValueAtTime(1.8, strikeTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, strikeTime + interval * 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(strikeTime);
      osc.stop(strikeTime + interval);

      activeOscillators.push(osc);
    }

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Industrial Dual Air Horn (Twin blasting tone)
 */
function playHornSynth(durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const mainGain = ctx.createGain();
    const pulseGain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(175, now);
    osc2.frequency.setValueAtTime(235, now);

    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(1.2, now); // Pulse rhythm

    lfo.connect(pulseGain.gain);
    osc1.connect(pulseGain);
    osc2.connect(pulseGain);
    pulseGain.connect(mainGain);
    mainGain.connect(ctx.destination);

    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(2.2, now + 0.05);
    mainGain.gain.setValueAtTime(2.2, now + durationSec - 0.2);
    mainGain.gain.linearRampToValueAtTime(0.01, now + durationSec);

    osc1.start(now);
    osc2.start(now);
    lfo.start(now);

    osc1.stop(now + durationSec);
    osc2.stop(now + durationSec);
    lfo.stop(now + durationSec);

    activeOscillators.push(osc1, osc2, lfo);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * European Two-Tone Emergency Vehicle Siren (Hi-Lo alternating)
 */
function playAmbulanceSynth(durationSec = 5.0): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const mainGain = ctx.createGain();

    osc.type = 'sawtooth';

    const stepDuration = 0.45;
    const steps = Math.floor(durationSec / stepDuration);
    for (let i = 0; i < steps; i++) {
      const t = now + (i * stepDuration);
      const freq = (i % 2 === 0) ? 960 : 720;
      osc.frequency.setValueAtTime(freq, t);
    }

    mainGain.connect(ctx.destination);
    osc.connect(mainGain);

    mainGain.gain.setValueAtTime(0, now);
    mainGain.gain.linearRampToValueAtTime(2.0, now + 0.05);
    mainGain.gain.setValueAtTime(2.0, now + durationSec - 0.2);
    mainGain.gain.linearRampToValueAtTime(0.01, now + durationSec);

    osc.start(now);
    osc.stop(now + durationSec);

    activeOscillators.push(osc);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Play gentle Announcement Notification Sound (non-startling, polite, elegant).
 * Can be customized by admin with airport chime, harmony chime, digital ping, or custom audio!
 */
export function playAnnouncementSound(config?: Partial<ExamConfig>): { stop: () => void } {
  stopAllAlarmSounds();

  // Subtle single pulse vibration on mobile (polite and gentle)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([120, 80, 160]);
    } catch (e) {}
  }

  const soundType = config?.announcementSoundType || 'CHIME_AIRPORT';

  // 1. CUSTOM AUDIO FILE / URL
  if (soundType === 'CUSTOM_AUDIO' && config?.customAnnouncementAudioUrl) {
    try {
      const audio = new Audio(config.customAnnouncementAudioUrl);
      audio.volume = 0.85;
      currentPlayingAudio = audio;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Custom announcement audio failed, fallback to airport chime:', err);
          playAirportChimeSynth();
        });
      }

      const timeoutId = setTimeout(() => {
        if (currentPlayingAudio === audio) {
          stopAllAlarmSounds();
        }
      }, 7000);

      return {
        stop: () => {
          clearTimeout(timeoutId);
          stopAllAlarmSounds();
        }
      };
    } catch (err) {
      console.warn('Custom announcement audio error, fallback:', err);
    }
  }

  // 2. HARMONY CHIME (Soft 3-tone ascending crystal chime)
  if (soundType === 'CHIME_HARMONY') {
    return playHarmonyChimeSynth();
  }

  // 3. DIGITAL CHIME (Crisp modern ping)
  if (soundType === 'CHIME_DIGITAL') {
    return playDigitalChimeSynth();
  }

  // 4. ELEGANT BELL (Warm acoustic bell chime)
  if (soundType === 'CHIME_ELEGANT') {
    return playElegantBellSynth();
  }

  // 5. DEFAULT: AIRPORT PUBLIC CHIME (Ding-dong double tone F5 -> A4, universally gentle & pleasant)
  return playAirportChimeSynth();
}

/**
 * Airport Public Chime (Classic Ding-Dong F5 -> A4)
 * Polite, soothing, and universally recognized as an announcement signal.
 */
function playAirportChimeSynth(): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    
    // Tone 1: F5 (698.46 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(698.46, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.7, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.7);

    // Tone 2: A4 (440.00 Hz)
    const t2 = now + 0.38;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440.0, t2);

    gain2.gain.setValueAtTime(0, t2);
    gain2.gain.linearRampToValueAtTime(0.85, t2 + 0.04);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 1.1);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t2);
    osc2.stop(t2 + 1.2);

    activeOscillators.push(osc1, osc2);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Harmony Chime (C5 -> E5 -> G5)
 * Ascending warm musical triad chord.
 */
function playHarmonyChimeSynth(): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((freq, idx) => {
      const startTime = now + (idx * 0.18);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.65, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.95);

      activeOscillators.push(osc);
    });

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Digital Chime (A5 -> D6)
 * Crisp modern friendly notification sound.
 */
function playDigitalChimeSynth(): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const notes = [880.0, 1174.66]; // A5 -> D6

    notes.forEach((freq, idx) => {
      const startTime = now + (idx * 0.14);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.7, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.55);

      activeOscillators.push(osc);
    });

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

/**
 * Elegant Bell (D5 -> A5)
 * Soft acoustic bell with warm resonance.
 */
function playElegantBellSynth(): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.65, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.75);

    const t2 = now + 0.22;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, t2);

    gain2.gain.setValueAtTime(0, t2);
    gain2.gain.linearRampToValueAtTime(0.75, t2 + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 1.2);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t2);
    osc2.stop(t2 + 1.25);

    activeOscillators.push(osc1, osc2);

    return {
      stop: () => stopAllAlarmSounds()
    };
  } catch (e) {
    return { stop: () => {} };
  }
}

