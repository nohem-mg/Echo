const STORAGE_KEY = "echo:sfx:v1";
const MASTER_GAIN = 0.11;

type SoundId =
  | "previewPlay"
  | "previewPause"
  | "trackUpload"
  | "pipelineStart"
  | "stepComplete"
  | "verifySuccess"
  | "paymentSuccess"
  | "verdictClean"
  | "verdictSimilar"
  | "verdictRejected"
  | "verdictError"
  | "sealConfirmed"
  | "uiClick";

let audioContext: AudioContext | null = null;

type VinylHoverState = {
  oscillators: OscillatorNode[];
  noiseSource: AudioBufferSourceNode | null;
  masterGain: GainNode;
  warmFilter: BiquadFilterNode;
  melodyTimer: ReturnType<typeof setInterval> | null;
  melodyStep: number;
};

let vinylHoverState: VinylHoverState | null = null;

// Cozy Dm9 pad + sparse soul plucks (lo-fi jazz feel).
const VINYL_PAD_HZ = [146.83, 174.61, 220, 261.63, 329.63] as const;
const VINYL_MELODY_HZ = [392, 440, 493.88, 523.25, 493.88, 440] as const;

function prefersQuietUi(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMuted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return localStorage.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

function isEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (isMuted()) {
    return false;
  }

  return !prefersQuietUi();
}

function canPlayVinylHover(): boolean {
  return !isMuted();
}

function setEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // ignore private browsing
  }
}

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ?? null;
}

async function ensureAudioReady(): Promise<AudioContext | null> {
  if (!isEnabled()) {
    return null;
  }

  return resumeAudioContext();
}

/** Call synchronously inside pointerdown/click — keeps the browser user-gesture unlock. */
function prepareAudioFromUserGesture(): AudioContext | null {
  if (!canPlayVinylHover()) {
    return null;
  }

  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

async function resumeAudioContext(): Promise<AudioContext | null> {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      return null;
    }
  }

  return audioContext.state === "running" ? audioContext : null;
}

let unlockListenersInstalled = false;
let userHasInteracted = false;

function markUserInteracted(): AudioContext | null {
  userHasInteracted = true;
  return prepareAudioFromUserGesture();
}

function isAudioRunning(): boolean {
  return audioContext?.state === "running";
}

function installAudioUnlockListeners() {
  if (unlockListenersInstalled || typeof window === "undefined") {
    return;
  }

  unlockListenersInstalled = true;

  const unlock = () => {
    markUserInteracted();
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.55;
  }

  return buffer;
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  options?: { type?: OscillatorType; gain?: number; delay?: number },
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + (options?.delay ?? 0);
  const peak = MASTER_GAIN * (options?.gain ?? 1);

  osc.type = options?.type ?? "sine";
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function playNoiseBurst(ctx: AudioContext, duration: number, gain = 0.7) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();
  const start = ctx.currentTime;

  source.buffer = createNoiseBuffer(ctx, duration);
  filter.type = "bandpass";
  filter.frequency.value = 900;
  filter.Q.value = 0.7;

  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(MASTER_GAIN * gain, start + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function playSequence(ctx: AudioContext, frequencies: number[], gap = 0.09, type: OscillatorType = "sine") {
  frequencies.forEach((frequency, index) => {
    playTone(ctx, frequency, 0.16, { type, gain: 0.75, delay: index * gap });
  });
}

const SOUND_PLAYERS: Record<SoundId, (ctx: AudioContext) => void> = {
  previewPlay: (ctx) => {
    playNoiseBurst(ctx, 0.12, 0.45);
    playTone(ctx, 72, 0.18, { type: "triangle", gain: 0.9, delay: 0.02 });
    playTone(ctx, 196, 0.1, { gain: 0.35, delay: 0.05 });
  },
  previewPause: (ctx) => {
    playTone(ctx, 240, 0.07, { type: "triangle", gain: 0.5 });
  },
  trackUpload: (ctx) => {
    playTone(ctx, 180, 0.08, { type: "triangle", gain: 0.55 });
    playTone(ctx, 320, 0.12, { gain: 0.65, delay: 0.05 });
    playTone(ctx, 480, 0.14, { gain: 0.5, delay: 0.11 });
  },
  pipelineStart: (ctx) => {
    playSequence(ctx, [220, 277, 330], 0.07, "triangle");
  },
  stepComplete: (ctx) => {
    playTone(ctx, 880, 0.05, { type: "square", gain: 0.22 });
    playTone(ctx, 1320, 0.04, { gain: 0.12, delay: 0.03 });
  },
  verifySuccess: (ctx) => {
    playSequence(ctx, [392, 494, 587], 0.08);
  },
  paymentSuccess: (ctx) => {
    playTone(ctx, 520, 0.09, { gain: 0.6 });
    playTone(ctx, 780, 0.11, { gain: 0.45, delay: 0.06 });
  },
  verdictClean: (ctx) => {
    playSequence(ctx, [261.63, 329.63, 392, 523.25], 0.1);
    playTone(ctx, 1046.5, 0.22, { gain: 0.35, delay: 0.42 });
  },
  verdictSimilar: (ctx) => {
    playTone(ctx, 293.66, 0.18, { type: "triangle", gain: 0.55 });
    playTone(ctx, 349.23, 0.2, { type: "triangle", gain: 0.5, delay: 0.12 });
  },
  verdictRejected: (ctx) => {
    playTone(ctx, 146.83, 0.22, { type: "sawtooth", gain: 0.35 });
    playTone(ctx, 155.56, 0.24, { type: "sawtooth", gain: 0.3, delay: 0.08 });
  },
  verdictError: (ctx) => {
    playTone(ctx, 110, 0.28, { type: "square", gain: 0.28 });
  },
  sealConfirmed: (ctx) => {
    playTone(ctx, 440, 0.1, { gain: 0.55 });
    playSequence(ctx, [554.37, 659.25, 880], 0.09);
  },
  uiClick: (ctx) => {
    playTone(ctx, 520, 0.045, { type: "triangle", gain: 0.2 });
    playTone(ctx, 780, 0.03, { gain: 0.1, delay: 0.004 });
  },
};

function playFromUserGesture(id: SoundId) {
  if (isMuted()) {
    return;
  }

  const ctx = markUserInteracted();
  if (!ctx) {
    return;
  }

  const playNow = () => {
    try {
      SOUND_PLAYERS[id](ctx);
    } catch {
      // Audio should never break the UI.
    }
  };

  if (ctx.state === "running") {
    playNow();
    return;
  }

  void ctx.resume().then(() => {
    playNow();
  });
}

function uiClickFromUserGesture() {
  playFromUserGesture("uiClick");
}

function play(id: SoundId) {
  void ensureAudioReady().then((ctx) => {
    if (!ctx) {
      return;
    }

    try {
      SOUND_PLAYERS[id](ctx);
    } catch {
      // Audio should never break the UI.
    }
  });
}

function playWarmPluck(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  peakGain = 0.045,
) {
  const when = ctx.currentTime;
  const osc = ctx.createOscillator();
  const tone = ctx.createBiquadFilter();
  const env = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, when);

  tone.type = "lowpass";
  tone.frequency.setValueAtTime(1180, when);
  tone.Q.value = 0.6;

  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peakGain, when + 0.04);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.72);

  osc.connect(tone);
  tone.connect(env);
  env.connect(destination);
  osc.start(when);
  osc.stop(when + 0.78);
}

function startVinylHoverWithContext(ctx: AudioContext) {
  if (vinylHoverState) {
    return;
  }

  try {
    // Immediate audible cue so hover feedback is obvious.
    playTone(ctx, 220, 0.18, { type: "triangle", gain: 0.55, delay: 0.02 });
    playTone(ctx, 329.63, 0.22, { type: "sine", gain: 0.4, delay: 0.08 });

    const start = ctx.currentTime;
    const warmFilter = ctx.createBiquadFilter();
    const masterGain = ctx.createGain();
    const padBus = ctx.createGain();

    warmFilter.type = "lowpass";
    warmFilter.frequency.setValueAtTime(1050, start);
    warmFilter.Q.value = 0.45;

    padBus.gain.setValueAtTime(0.55, start);
    padBus.connect(warmFilter);
    warmFilter.connect(masterGain);
    masterGain.gain.setValueAtTime(0.0001, start);
    masterGain.gain.exponentialRampToValueAtTime(MASTER_GAIN * 0.34, start + 0.28);
    masterGain.connect(ctx.destination);

    const oscillators: OscillatorNode[] = [];

    for (const frequency of VINYL_PAD_HZ) {
      const osc = ctx.createOscillator();
      const voice = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      osc.detune.setValueAtTime((Math.random() - 0.5) * 4, start);
      voice.gain.setValueAtTime(frequency < 200 ? 0.09 : 0.05, start);
      osc.connect(voice);
      voice.connect(padBus);
      osc.start(start);
      oscillators.push(osc);
    }

    const filterLfo = ctx.createOscillator();
    const filterLfoDepth = ctx.createGain();
    filterLfo.type = "sine";
    filterLfo.frequency.setValueAtTime(0.09, start);
    filterLfoDepth.gain.setValueAtTime(280, start);
    filterLfo.connect(filterLfoDepth);
    filterLfoDepth.connect(warmFilter.frequency);
    filterLfo.start(start);
    oscillators.push(filterLfo);

    const noiseSource = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noiseSource.buffer = createNoiseBuffer(ctx, 3);
    noiseSource.loop = true;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 720;
    noiseFilter.Q.value = 0.35;
    noiseGain.gain.setValueAtTime(0.006, start);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(padBus);
    noiseSource.start(start);

    const state: VinylHoverState = {
      oscillators,
      noiseSource,
      masterGain,
      warmFilter,
      melodyTimer: null,
      melodyStep: 0,
    };
    vinylHoverState = state;

    const tickMelody = () => {
      if (!vinylHoverState) {
        return;
      }
      const frequency = VINYL_MELODY_HZ[vinylHoverState.melodyStep % VINYL_MELODY_HZ.length];
      vinylHoverState.melodyStep += 1;
      playWarmPluck(ctx, warmFilter, frequency);
    };

    window.setTimeout(tickMelody, 280);
    state.melodyTimer = setInterval(tickMelody, 1650);
  } catch {
    stopVinylHover();
  }
}

async function startVinylHover() {
  if (vinylHoverState) {
    return;
  }

  const ctx = audioContext?.state === "running"
    ? audioContext
    : await resumeAudioContextForVinyl();

  if (!ctx) {
    return;
  }

  startVinylHoverWithContext(ctx);
}

async function resumeAudioContextForVinyl(): Promise<AudioContext | null> {
  if (!canPlayVinylHover()) {
    return null;
  }

  return resumeAudioContext();
}

function startVinylHoverFromUserGesture() {
  if (vinylHoverState) {
    return;
  }

  markUserInteracted();

  const ctx = audioContext;
  if (!ctx) {
    return;
  }

  if (ctx.state === "running") {
    startVinylHoverWithContext(ctx);
    return;
  }

  void ctx.resume().then(() => {
    if (!canPlayVinylHover() || vinylHoverState) {
      return;
    }

    startVinylHoverWithContext(ctx);
  });
}

function stopVinylHover() {
  if (!vinylHoverState) {
    return;
  }

  const state = vinylHoverState;
  vinylHoverState = null;

  if (state.melodyTimer) {
    clearInterval(state.melodyTimer);
  }

  const ctx = audioContext;
  if (!ctx) {
    return;
  }

  try {
    const stopAt = ctx.currentTime + 0.28;
    state.masterGain.gain.cancelScheduledValues(ctx.currentTime);
    state.masterGain.gain.setValueAtTime(state.masterGain.gain.value, ctx.currentTime);
    state.masterGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    for (const osc of state.oscillators) {
      osc.stop(stopAt + 0.05);
    }

    state.noiseSource?.stop(stopAt + 0.05);
  } catch {
    // ignore teardown errors
  }
}

export const echoSounds = {
  isEnabled,
  isMuted,
  hasUserInteracted: () => userHasInteracted,
  isAudioRunning,
  setEnabled,
  installAudioUnlockListeners,
  ensureAudioReady,
  toggle() {
    const enabling = isMuted();
    setEnabled(enabling);
    if (enabling) {
      markUserInteracted();
      if (audioContext?.state === "running") {
        playTone(audioContext, 660, 0.06, { gain: 0.35 });
      } else {
        void audioContext?.resume().then(() => {
          if (audioContext) {
            playTone(audioContext, 660, 0.06, { gain: 0.35 });
          }
        });
      }
    }
    return enabling;
  },
  previewPlay: () => play("previewPlay"),
  previewPause: () => play("previewPause"),
  trackUpload: () => play("trackUpload"),
  pipelineStart: () => play("pipelineStart"),
  stepComplete: () => play("stepComplete"),
  verifySuccess: () => play("verifySuccess"),
  paymentSuccess: () => play("paymentSuccess"),
  verdictClean: () => play("verdictClean"),
  verdictSimilar: () => play("verdictSimilar"),
  verdictRejected: () => play("verdictRejected"),
  verdictError: () => play("verdictError"),
  sealConfirmed: () => play("sealConfirmed"),
  uiClick: () => play("uiClick"),
  uiClickFromUserGesture,
  vinylHoverStart: startVinylHover,
  vinylHoverStartFromUserGesture: startVinylHoverFromUserGesture,
  vinylHoverStop: stopVinylHover,
};
