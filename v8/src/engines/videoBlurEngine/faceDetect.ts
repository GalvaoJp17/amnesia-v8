interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DetectorResult = { boundingBox: DOMRectReadOnly | FaceBox } | FaceBox;

let faceDetector: FaceDetector | null = null;
let detectorAvailable: boolean | null = null;

function normaliseBox(box: DOMRectReadOnly | FaceBox, width: number, height: number): FaceBox {
  return {
    x: Math.max(0, box.x ?? box.left ?? 0),
    y: Math.max(0, box.y ?? box.top ?? 0),
    width: Math.min(width, box.width ?? (box.right ?? width) - (box.x ?? box.left ?? 0)),
    height: Math.min(height, box.height ?? (box.bottom ?? height) - (box.y ?? box.top ?? 0))
  };
}

async function detectWithApi(source: ImageBitmapSource, width: number, height: number): Promise<FaceBox[] | null> {
  if (detectorAvailable === false) {
    return null;
  }

  if (!faceDetector && 'FaceDetector' in window) {
    faceDetector = new FaceDetector({ maxDetectedFaces: 3, fastMode: true });
  }

  if (!faceDetector) {
    detectorAvailable = false;
    return null;
  }

  try {
    const faces = (await faceDetector.detect(source as unknown as ImageBitmapSource)) as DetectorResult[];
    detectorAvailable = true;
    return faces.map((face) => {
      const box = 'boundingBox' in face ? face.boundingBox : face;
      return normaliseBox(box, width, height);
    });
  } catch (error) {
    console.warn('Amnesia face detection fallback', error);
    detectorAvailable = false;
    return null;
  }
}

function fallbackFace(width: number, height: number): FaceBox[] {
  const size = Math.min(width, height);
  const fallbackWidth = size * 0.55;
  const fallbackHeight = size * 0.62;
  return [
    {
      x: (width - fallbackWidth) / 2,
      y: height * 0.18,
      width: fallbackWidth,
      height: fallbackHeight
    }
  ];
}

export async function detectFaces(source: ImageBitmapSource & { width?: number; height?: number }): Promise<FaceBox[]> {
  const width = (source as OffscreenCanvas).width ?? (source as HTMLCanvasElement).width ?? (source as any).width ?? 0;
  const height = (source as OffscreenCanvas).height ?? (source as HTMLCanvasElement).height ?? (source as any).height ?? 0;

  if (!width || !height) {
    return fallbackFace(width || 640, height || 480);
  }

  const viaApi = await detectWithApi(source, width, height);
  if (viaApi && viaApi.length) {
    return viaApi;
  }

  return fallbackFace(width, height);
}
