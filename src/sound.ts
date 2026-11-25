let context: AudioContext | undefined;
export function playSound(
  type: "chip" | "turn" | "win",
  enabled: boolean,
): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    const notes =
      type === "win"
        ? [523, 659, 784]
        : type === "turn"
          ? [587, 784]
          : [370, 494];
    for (const [index, frequency] of notes.entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = context.currentTime + index * 0.075;
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.045, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.17);
    }
  } catch {
    /* Browsers may restrict audio until interaction. */
  }
}
