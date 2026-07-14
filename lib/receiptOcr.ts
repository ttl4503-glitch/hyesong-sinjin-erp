// Best-effort client-side OCR to pull a total amount off a receipt / tax
// invoice photo, using the same tesseract.js engine as the worker ID/bankbook
// recognition. The user can always override the auto-filled amount by hand.
const AMOUNT_KEYWORDS = [
  "합계금액",
  "합계",
  "총액",
  "총 금액",
  "청구금액",
  "결제금액",
  "공급대가합계",
  "금액계",
];

export function parseReceiptAmount(text: string): number | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const kw of AMOUNT_KEYWORDS) {
    for (const line of lines) {
      if (!line.includes(kw)) continue;
      const nums = line.match(/[\d][\d,]{2,}/g);
      if (nums && nums.length) {
        const n = Number(nums[nums.length - 1].replace(/,/g, ""));
        if (n > 0) return n;
      }
    }
  }

  // Fallback: no labeled total found — guess the largest comma-formatted
  // number in the whole receipt (totals are usually the biggest figure).
  const allNums = Array.from(text.matchAll(/\d[\d,]{2,}/g))
    .map((m) => Number(m[0].replace(/,/g, "")))
    .filter((n) => n >= 1000);
  if (allNums.length) return Math.max(...allNums);

  return null;
}

export async function extractReceiptAmount(file: File): Promise<number | null> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("kor+eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return parseReceiptAmount(text);
  } finally {
    await worker.terminate();
  }
}
