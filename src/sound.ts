let context: AudioContext | undefined;
export function playSound(
  type: "chip" | "deal" | "turn" | "win" | "allin",
  enabled: boolean,
): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    const notes = {
      chip: [370, 494],
      deal: [330, 247, 392],
      turn: [587, 784],
      win: [523, 659, 784, 1047],
      allin: [196, 247, 330, 392],
    }[type];
    for (const [index, frequency] of notes.entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.075;
      oscillator.type =
        type === "win" ? "sine" : type === "allin" ? "sawtooth" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(
        type === "win" ? 0.06 : type === "allin" ? 0.025 : 0.035,
        at + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        at + (type === "win" || type === "allin" ? 0.32 : 0.16),
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + (type === "win" || type === "allin" ? 0.33 : 0.17));
    }
  } catch {
    /* Browsers may restrict audio until interaction. */
  }
}
