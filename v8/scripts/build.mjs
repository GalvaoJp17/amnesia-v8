import { build } from 'esbuild';
import { rm, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(scriptDir, '..');
const outdir = resolve(root, 'dist');
const srcDir = resolve(root, 'src');
const publicDir = resolve(root, 'public');
const manifestPath = resolve(root, 'manifest.json');

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp(publicDir, outdir, { recursive: true });
  await cp(manifestPath, resolve(outdir, 'manifest.json'));

  await build({
    entryPoints: [
      resolve(srcDir, 'background/index.ts'),
      resolve(srcDir, 'ui/popup.tsx'),
      resolve(srcDir, 'content/llm/detector.ts'),
      resolve(srcDir, 'content/llm/previewOverlay.ts'),
      resolve(srcDir, 'content/llm/piiGuard.ts'),
      resolve(srcDir, 'content/llm/submitInterceptor.ts'),
      resolve(srcDir, 'content/meetings/meetingDetector.ts'),
      resolve(srcDir, 'content/meetings/recorderDetector.ts'),
      resolve(srcDir, 'content/meetings/streamHooks.ts'),
      resolve(srcDir, 'engines/videoBlurEngine/faceDetect.ts'),
      resolve(srcDir, 'engines/videoBlurEngine/blurProcessor.ts'),
      resolve(srcDir, 'engines/videoBlurEngine/api.ts'),
      resolve(srcDir, 'engines/voiceMaskEngine/worklet.js'),
      resolve(srcDir, 'engines/voiceMaskEngine/node.ts'),
      resolve(srcDir, 'engines/voiceMaskEngine/api.ts')
    ],
    outdir,
    bundle: true,
    format: 'esm',
    sourcemap: true,
    target: ['chrome120'],
    logLevel: 'info',
    jsx: 'automatic'
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
