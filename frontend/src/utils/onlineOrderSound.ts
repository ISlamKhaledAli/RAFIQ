const SOUND_STORAGE_KEY = 'rafiq_online_order_sound';

export function isOnlineOrderSoundEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setOnlineOrderSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Plays a clear, pleasant 3-note POS delivery chime using offline Web Audio API (Chrome 109 compatible).
 */
export function playOnlineOrderChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Bright, unmistakable 3-note arpeggio (A5 -> C#6 -> E6) with warm decay
    const notes = [880, 1108.73, 1318.51];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.36);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}
