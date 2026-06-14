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

function prefersQuietUi(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "off") {
      return false;
    }
  } catch {
    return false;
  }

  return !prefersQuietUi();
}

function setEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // ignore private browsing
  }
}

function getContext(): AudioContext | null {
  if (!isEnabled() || typeof window === "undefined") {
    return null;
  }

  const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    playTone(ctx, 620, 0.04, { type: "triangle", gain: 0.25 });
  },
};

function play(id: SoundId) {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  try {
    SOUND_PLAYERS[id](ctx);
  } catch {
    // Audio should never break the UI.
  }
}

export const echoSounds = {
  isEnabled,
  setEnabled,
  toggle() {
    const next = !isEnabled();
    setEnabled(next);
    if (next) {
      const ctx = getContext();
      if (ctx) {
        playTone(ctx, 660, 0.06, { gain: 0.35 });
      }
    }
    return next;
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
};
