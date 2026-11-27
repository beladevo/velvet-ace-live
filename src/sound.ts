let context: AudioContext | undefined;
let chipNoise: AudioBuffer | undefined;
let clapNoise: AudioBuffer | undefined;

function chips(amount: number, audio: AudioContext): void {
  chipNoise ??= (() => {
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * 0.08),
      audio.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++)
      samples[index] = Math.random() * 2 - 1;
    return buffer;
  })();
  const count = Math.min(4, Math.max(2, 2 + Math.floor(amount / 250)));
  const start = audio.currentTime + 0.01;
  for (let index = 0; index < count; index++) {
    const at = start + index * 0.065;
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const tick = audio.createGain();
    noise.buffer = chipNoise;
    filter.type = "highpass";
    filter.frequency.value = 1250 + index * 160;
    tick.gain.setValueAtTime(0.0001, at);
    tick.gain.exponentialRampToValueAtTime(0.105, at + 0.003);
    tick.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
    noise.connect(filter).connect(tick).connect(audio.destination);
    noise.start(at);
    noise.stop(at + 0.06);

    const ring = audio.createOscillator();
    const ringGain = audio.createGain();
    ring.type = "sine";
    ring.frequency.setValueAtTime(1320 + index * 115, at);
    ring.frequency.exponentialRampToValueAtTime(880 + index * 75, at + 0.11);
    ringGain.gain.setValueAtTime(0.0001, at);
    ringGain.gain.exponentialRampToValueAtTime(0.045, at + 0.004);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    ring.connect(ringGain).connect(audio.destination);
    ring.start(at);
    ring.stop(at + 0.125);
  }
}

function claps(audio: AudioContext): void {
  clapNoise ??= (() => {
    const buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * 0.12),
      audio.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++)
      samples[index] = Math.random() * 2 - 1;
    return buffer;
  })();
  const start = audio.currentTime + 0.01;
  for (let index = 0; index < 14; index++) {
    const at = start + index * 0.085 + Math.random() * 0.025;
    const peak = 0.04 + 0.045 * Math.sin((Math.PI * (index + 1)) / 15);
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    noise.buffer = clapNoise;
    filter.type = "bandpass";
    filter.frequency.value = 1500 + (index % 4) * 160;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(peak * 0.3, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(peak * 0.7, at + 0.026);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    noise.connect(filter).connect(gain).connect(audio.destination);
    noise.start(at);
    noise.stop(at + 0.12);
  }
}

export function playSound(
  type: "chip" | "deal" | "turn" | "win" | "allin",
  enabled: boolean,
  amount = 0,
): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
    if (type === "chip") {
      chips(amount, context);
      return;
    }
    if (type === "win") {
      claps(context);
      return;
    }
    const notes = {
      deal: [330, 247, 392],
      turn: [587, 784],
      allin: [196, 247, 330, 392],
    }[type];
    for (const [index, frequency] of notes.entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.075;
      oscillator.type = type === "allin" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(
        type === "allin" ? 0.025 : 0.035,
        at + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        at + (type === "allin" ? 0.32 : 0.16),
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + (type === "allin" ? 0.33 : 0.17));
    }
  } catch {
    /* Browsers may restrict audio until interaction. */
  }
}
