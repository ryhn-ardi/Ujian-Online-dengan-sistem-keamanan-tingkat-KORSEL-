import { ExamConfig } from '../types';

let sharedAudioContext: AudioContext | null = null;
let currentPlayingAudio: HTMLAudioElement | null = null;
let activeOscillators: OscillatorNode[] = [];

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
  if (alarmType === 'CUSTOM_AUDIO' && config?.customAlarmAudioUrl) {
    try {
      const audio = new Audio(config.customAlarmAudioUrl);
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

  // 5. DEFAULT: STANDARD POLICE / PROCTOR SIREN (The currently used sound)
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
