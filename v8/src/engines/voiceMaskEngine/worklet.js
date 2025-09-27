// Placeholder AudioWorkletProcessor script.
class VoiceMaskWorklet extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (input && output) {
      for (let channel = 0; channel < output.length; channel += 1) {
        const inputChannel = input[channel] || [];
        const outputChannel = output[channel];
        for (let i = 0; i < outputChannel.length; i += 1) {
          outputChannel[i] = inputChannel[i] ?? 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('voice-mask-worklet', VoiceMaskWorklet);
