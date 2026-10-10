const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 60_000_000;
const OUTPUT_EDGE_SIZES = [1600, 1400, 1200] as const;
const OUTPUT_QUALITIES = [0.84, 0.78, 0.72] as const;

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

export type OptimizedProductImage = {
  file: File;
  width: number;
  height: number;
  originalName: string;
};

export class ProductImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageProcessingError";
  }
}

export function getResizedDimensions(width: number, height: number, maxEdge: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ProductImageProcessingError("No se pudieron leer las dimensiones de la fotografía.");
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isHeicCandidate(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();

  return HEIC_MIME_TYPES.has(mimeType) || extension === "heic" || extension === "heif";
}

function validateInput(file: File) {
  if (file.size === 0) {
    throw new ProductImageProcessingError("El archivo está vacío. Selecciona otra fotografía.");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new ProductImageProcessingError("La fotografía supera el máximo de 20 MiB.");
  }

  if (!isHeicCandidate(file) && !SUPPORTED_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new ProductImageProcessingError("Formato no admitido. Usa JPG, PNG, WebP, HEIC o HEIF.");
  }
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  if (isHeicCandidate(file)) {
    try {
      const { heicTo, isHeic } = await import("heic-to");
      if (!(await isHeic(file))) {
        throw new ProductImageProcessingError("El archivo no parece ser una fotografía HEIC/HEIF válida.");
      }

      return await heicTo({
        blob: file,
        type: "bitmap",
        options: { imageOrientation: "from-image" },
      });
    } catch (error) {
      if (error instanceof ProductImageProcessingError) throw error;
      throw new ProductImageProcessingError(
        "No se pudo abrir esta foto HEIC/HEIF. Prueba exportarla de nuevo desde el dispositivo.",
      );
    }
  }

  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ProductImageProcessingError(
      "No se pudo abrir la fotografía. Comprueba que sea un archivo JPG, PNG o WebP válido.",
    );
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new ProductImageProcessingError("El navegador no pudo preparar la fotografía."));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement, quality: number) {
  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp.type === "image/webp") return webp;

  const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  if (jpeg.type === "image/jpeg") return jpeg;

  throw new ProductImageProcessingError("Este navegador no puede preparar la fotografía en un formato compatible.");
}

function outputName(originalName: string, mimeType: string) {
  const baseName = originalName.replace(/\.[^.]+$/, "") || "fotografia";
  const extension = mimeType === "image/webp" ? ".webp" : ".jpg";
  return `${baseName}${extension}`;
}

export async function optimizeProductImage(file: File): Promise<OptimizedProductImage> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ProductImageProcessingError("El procesamiento de fotografías debe ejecutarse en el navegador.");
  }

  validateInput(file);
  const bitmap = await decodeImage(file);

  try {
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new ProductImageProcessingError("La fotografía tiene demasiados píxeles para procesarla con seguridad.");
    }

    for (const maxEdge of OUTPUT_EDGE_SIZES) {
      const dimensions = getResizedDimensions(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new ProductImageProcessingError("El navegador no pudo preparar la fotografía.");
      }

      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, dimensions.width, dimensions.height);
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

      try {
        for (const quality of OUTPUT_QUALITIES) {
          const blob = await encodeCanvas(canvas, quality);
          if (blob.size <= MAX_OUTPUT_BYTES) {
            return {
              file: new File([blob], outputName(file.name, blob.type), { type: blob.type }),
              width: dimensions.width,
              height: dimensions.height,
              originalName: file.name,
            };
          }
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    throw new ProductImageProcessingError(
      "La fotografía sigue superando 2 MiB después de optimizarla. Prueba una imagen menos detallada o con menor resolución.",
    );
  } finally {
    bitmap.close();
  }
}
