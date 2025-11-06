const FALLBACK_COLOR = 'var(--card-accent-default, var(--accent))';

const toHex = (value: number): string => {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
};

const readImageData = (image: HTMLImageElement): Uint8ClampedArray | undefined => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (width === 0 || height === 0) {
    return undefined;
  }

  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext('2d');
      if (!context) {
        return undefined;
      }
      context.drawImage(image, 0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      return data;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }
    context.drawImage(image, 0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      return undefined;
    }

    throw error;
  }
};

export const getDominantColor = async (imgUrl: string): Promise<string> => {
  if (!imgUrl || typeof imgUrl !== 'string') {
    return FALLBACK_COLOR;
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    const handleError = (): void => {
      resolve(FALLBACK_COLOR);
    };

    image.onerror = handleError;
    image.onabort = handleError;

    image.onload = () => {
      let data: Uint8ClampedArray | undefined;
      try {
        data = readImageData(image);
      } catch {
        resolve(FALLBACK_COLOR);
        return;
      }

      if (!data || data.length < 3) {
        resolve(FALLBACK_COLOR);
        return;
      }

      const [r, g, b, a] = data;
      const alpha = typeof a === 'number' ? a / 255 : 1;

      if (alpha === 0) {
        resolve(FALLBACK_COLOR);
        return;
      }

      const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      resolve(hex);
    };

    image.src = imgUrl;
  });
};

