export class AudioSystem {
  constructor() {
    this.context = null;
    this.voiceEnabled = true;
    this.soundEnabled = true;
    this.lastSpeech = '';
  }

  unlock() {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.context) this.context = new Ctx();
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  setVoiceEnabled(enabled) {
    this.voiceEnabled = Boolean(enabled);
    if (!enabled && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  tone(frequency, start, duration, gain = 0.045, type = 'sine') {
    if (!this.context || !this.soundEnabled) return;
    const now = this.context.currentTime + start;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(gain, now + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  beep(kind = 'info') {
    this.unlock();
    if (!this.context || !this.soundEnabled) return;
    const patterns = {
      info: [523.25, 659.25],
      reminder: [587.33, 783.99, 659.25],
      success: [523.25, 659.25, 783.99],
      alert: [440, 392, 440],
      wearable: [880, 740, 880],
    };
    const notes = patterns[kind] || patterns.info;
    notes.forEach((frequency, index) => {
      this.tone(frequency, index * 0.13, 0.22, kind === 'alert' ? 0.055 : 0.038, 'sine');
    });
  }

  speak(text, options = {}) {
    this.lastSpeech = text;
    options.onCaption?.(text);
    if (!this.voiceEnabled) return false;
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = options.rate || 0.94;
      utterance.pitch = options.pitch || 1;
      utterance.volume = 0.75;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const spanish = voices.find((voice) => voice.lang?.toLowerCase().startsWith('es'));
      if (spanish) utterance.voice = spanish;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      console.warn('Síntesis de voz no disponible:', error);
      return false;
    }
  }

  stop() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}
