"use client";
// Alerta sonoro de novo pedido (Web Audio, sem arquivo). Preferência salva localmente.
const KEY = "tb_sound";

export function soundEnabled() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("tb-sound-change"));
}

let ctx: AudioContext | null = null;
/** "Plim-plim" de balcão: duas notas curtas */
export function playChime(times = 2) {
  if (!soundEnabled()) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (let r = 0; r < times; r++) {
      [[1318.5, 0], [1760, 0.14]].forEach(([freq, offset]) => {
        const o = ctx!.createOscillator();
        const g = ctx!.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        const t = now + r * 0.55 + offset;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g).connect(ctx!.destination);
        o.start(t);
        o.stop(t + 0.55);
      });
    }
  } catch {
    /* navegador sem áudio */
  }
}

/** Desbloqueia o áudio no primeiro clique (política de autoplay dos navegadores) */
export function primeAudio() {
  const unlock = () => {
    try {
      ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void ctx.resume();
    } catch {
      /* ignore */
    }
    window.removeEventListener("pointerdown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
}
