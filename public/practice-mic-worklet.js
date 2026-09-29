// Ask 3C Practice, hands-free: the mic as 16 kHz 16-bit PCM for live
// transcription. Runs on the audio thread; each 100 ms frame goes to the page
// with its loudness (RMS, 0..1) for the page's own pause detection.
// Loaded with audioWorklet.addModule('/practice-mic-worklet.js').

const OUT_RATE = 16000;
const FRAME = 1600; // 100 ms at 16 kHz

class PracticeMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / OUT_RATE; // input samples per output sample
    this.pos = 0; // how far into the current output sample, in input samples
    this.sum = 0;
    this.count = 0;
    this.frame = new Int16Array(FRAME);
    this.filled = 0;
    this.energy = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i += 1) {
      // A box average over each output sample's span: enough of a low-pass for speech.
      this.sum += channel[i];
      this.count += 1;
      this.pos += 1;
      if (this.pos >= this.step) {
        this.pos -= this.step;
        const value = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0;
        this.count = 0;
        this.frame[this.filled] = value < 0 ? value * 0x8000 : value * 0x7fff;
        this.energy += value * value;
        this.filled += 1;
        if (this.filled === FRAME) {
          const pcm = this.frame;
          this.port.postMessage({ pcm: pcm.buffer, rms: Math.sqrt(this.energy / FRAME) }, [pcm.buffer]);
          this.frame = new Int16Array(FRAME);
          this.filled = 0;
          this.energy = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('practice-mic', PracticeMic);
