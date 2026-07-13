// Downscales + re-encodes an uploaded photo client-side before it's sent to
// the server, so receipt photos (stored as base64 in Postgres) stay small.
export function compressImage(file: File, maxDim = 1400, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("캔버스를 사용할 수 없어요."));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없어요."));
    reader.readAsDataURL(file);
  });
}
