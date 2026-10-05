import { ExamConfig } from '../types';

let sharedAudioContext: AudioContext | null = null;
let currentPlayingAudio: HTMLAudioElement | null = null;
let activeOscillators: OscillatorNode[] = [];

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

export function warmUpAlarmAudioContext(): AudioContext | null {
  return getAudioContext();
}

export function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (e) {
    return null;
  }
}

export function stopAllAlarmSounds() {
  // Stop custom audio if playing
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    } catch (e) {}
    currentPlayingAudio = null;
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

/**
 * Play Alarm based on config selection.
 * Returns a controller with a stop function.
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
        const audio = new Audio(audioSource);
        audio.volume = 1.0;
        currentPlayingAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Custom audio playback failed, falling back to siren:', err);
            playSirenSynth(5.0);
          });
        }

        // Auto stop after 8 seconds if long audio
        const timeoutId = setTimeout(() => {
          if (currentPlayingAudio === audio) {
            stopAllAlarmSounds();
          }
        }, 8000);

        return {
          stop: () => {
            clearTimeout(timeoutId);
            stopAllAlarmSounds();
          }
        };
      } catch (err) {
        console.warn('Audio element error, fallback to siren:', err);
      }
    }
  }

  // 2. ELECTRONIC WARNING BUZZER
  if (alarmType === 'BUZZER') {
    return playBuzzerSynth(5.0);
  }

  // 3. NUCLEAR / AIR RAID SIREN
  if (alarmType === 'NUCLEAR') {
    return playNuclearSynth(5.0);
  }

  // 4. ALARM BELL
  if (alarmType === 'BELL') {
    return playBellSynth(5.0);
  }

  // 5. INDUSTRIAL DUAL AIR HORN
  if (alarmType === 'HORN') {
    return playHornSynth(5.0);
  }

  // 6. TWO-TONE EMERGENCY AMBULANCE SIREN
  if (alarmType === 'AMBULANCE') {
    return playAmbulanceSynth(5.0);
  }

  // 7. DEFAULT: STANDARD POLICE / PROCTOR SIREN (The currently used sound)
  return playSirenSynth(5.0);
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

