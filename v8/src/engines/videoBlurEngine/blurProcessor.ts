import { detectFaces } from './faceDetect';
import type { BlurEngineConfig } from './api';

interface BlurEngine {
  track: MediaStreamTrack;
  source: MediaStreamTrack;
  processor: MediaStreamTrackProcessor;
  generator: MediaStreamTrackGenerator;
  stop: () => void;
}

function getContext(canvas: OffscreenCanvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Unable to acquire 2D context for blur processor');
  }
  return ctx;
}

export async function createBlurProcessor(
  track: MediaStreamTrack,
  config: BlurEngineConfig = {}
): Promise<BlurEngine> {
  const clone = track.clone();
  const processor = new MediaStreamTrackProcessor({ track: clone });
  const generator = new MediaStreamTrackGenerator({ kind: 'video' });

  const reader = processor.readable.getReader();
  const writer = generator.writable.getWriter();

  const canvas = new OffscreenCanvas(2, 2);
  const ctx = getContext(canvas);

  let dynamicBlur = Math.max(12, Math.min(28, Math.floor(config.strength ?? 20)));
  const fallbackStrength = Math.max(8, Math.floor((config.fallbackStrength ?? dynamicBlur * 0.75)));
  let averageFrameTime = 0;
  let running = true;

  async function pump() {
    const { value: frame, done } = await reader.read();
    if (done || !frame || !running) {
      await writer.close();
      return;
    }

    const width = frame.displayWidth;
    const height = frame.displayHeight;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const start = performance.now?.() ?? Date.now();

    ctx.drawImage(frame, 0, 0, width, height);

    try {
      const faces = await detectFaces(canvas);
      ctx.save();
      for (const face of faces) {
        const x = Math.max(0, face.x);
        const y = Math.max(0, face.y);
        const w = Math.min(width - x, face.width);
        const h = Math.min(height - y, face.height);
        ctx.filter = `blur(${Math.round(dynamicBlur)}px)`;
        ctx.drawImage(canvas, x, y, w, h, x, y, w, h);
      }
      ctx.restore();
    } catch (error) {
      console.warn('Amnesia blur fallback', error);
      ctx.filter = `blur(${Math.round(dynamicBlur)}px)`;
      ctx.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
    }

    const newFrame = new VideoFrame(canvas, {
      timestamp: frame.timestamp,
      duration: frame.duration
    });
    frame.close();
    await writer.write(newFrame);
    newFrame.close();

    const elapsed = (performance.now?.() ?? Date.now()) - start;
    averageFrameTime = averageFrameTime * 0.6 + elapsed * 0.4;
    if (averageFrameTime > 24 && dynamicBlur > fallbackStrength) {
      dynamicBlur = Math.max(fallbackStrength, dynamicBlur - 2);
    } else if (averageFrameTime < 14 && dynamicBlur < (config.strength ?? 20)) {
      dynamicBlur = Math.min(config.strength ?? 20, dynamicBlur + 1);
    }

    if (running) {
      pump();
    }
  }

  pump();

  const stop = () => {
    running = false;
    reader.cancel().catch(() => {});
    writer.close().catch(() => {});
    generator.writable.abort().catch(() => {});
    generator.track.stop();
    clone.stop();
  };

  track.addEventListener('ended', stop, { once: true });

  return {
    track: generator.track,
    source: track,
    processor,
    generator,
    stop
  };
}
