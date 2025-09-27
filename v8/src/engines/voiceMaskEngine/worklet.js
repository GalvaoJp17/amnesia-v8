const BUFFER_LENGTH = 8192;

class VoiceMaskWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pitch = 1.08;
    this.formantMix = 0.18;
    this.buffers = Array.from({ length: 2 }, () => new Float32Array(BUFFER_LENGTH));
    this.phases = new Float32Array(2);
    this.writeIndex = 0;
    this.initialised = false;

    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (typeof data.pitch === 'number') {
        this.pitch = Math.min(1.25, Math.max(0.85, data.pitch));
      }
      if (typeof data.formantMix === 'number') {
        this.formantMix = Math.min(0.45, Math.max(0, data.formantMix));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output) {
      return true;
    }

    const frameSize = output[0].length;
    const channelCount = output.length;

    if (!this.initialised) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        this.phases[channel] = (BUFFER_LENGTH - frameSize * 2) % BUFFER_LENGTH;
      }
      this.initialised = true;
    }

    for (let channel = 0; channel < channelCount; channel += 1) {
      const inChannel = input[channel] || input[0] || new Float32Array(frameSize);
      const buffer = this.buffers[channel];
      for (let i = 0; i < frameSize; i += 1) {
        buffer[(this.writeIndex + i) % BUFFER_LENGTH] = inChannel[i] || 0;
      }
    }

    const baseWrite = this.writeIndex;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const outChannel = output[channel];
      const buffer = this.buffers[channel];
      let phase = this.phases[channel];
      const stride = this.pitch;

      for (let i = 0; i < frameSize; i += 1) {
        phase = (phase + stride) % BUFFER_LENGTH;
        const index = Math.floor(phase);
        const nextIndex = (index + 1) % BUFFER_LENGTH;
        const frac = phase - index;
        const dry = buffer[index] * (1 - frac) + buffer[nextIndex] * frac;
        const shiftedIndex = (index + 64) % BUFFER_LENGTH;
        const shifted = buffer[shiftedIndex];
        outChannel[i] = dry * (1 - this.formantMix) + shifted * this.formantMix;
      }

      // Keep phase behind write head to avoid underruns.
      const minPhase = (baseWrite + BUFFER_LENGTH - frameSize * 3) % BUFFER_LENGTH;
      if ((phase - minPhase + BUFFER_LENGTH) % BUFFER_LENGTH < frameSize) {
        phase = minPhase;
      }

      this.phases[channel] = phase;
    }

    this.writeIndex = (baseWrite + frameSize) % BUFFER_LENGTH;
    return true;
  }
}

registerProcessor('voice-mask-worklet', VoiceMaskWorklet);
