import * as XLSX from "xlsx";

export interface ParsedWorkItem {
  name: string;
  spec: string;
  unit: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface ParsedWorkbook {
  items: ParsedWorkItem[];
  total: number;
  sheetName: string;
}

// "품명" (item name) is listed first on purpose: some 내역서 layouts have
// BOTH a "공종" column (section number like "1." / "1)", only filled on
// category/subtotal rows) and a separate "품명" column (the actual item
// name, filled on every leaf row). When both exist we must prefer "품명" —
// see findNameCol below, which checks keys in this priority order across
// ALL columns rather than scanning column-by-column.
const nameKeys = ["품명", "공종", "품목", "명칭", "항목"];
const specKeys = ["규격", "규격/모델", "사양"];
const unitKeys = ["단위"];
const qtyKeys = ["수량"];
const priceKeys = ["단가"];
const amountKeys = ["금액", "합계금액", "공급가액"];
const skipNameKeys = ["합계", "소계", "계", "총계", "비고"];

// Sheet names that are clearly NOT the item-level breakdown, even if they
// happen to contain a "내역" substring (e.g. 단가산출내역서, 수량산출내역서).
const excludeSheetKeys = ["단가산출", "수량산출", "일위대가", "표지"];
// Summary-by-공종 sheets (총괄내역서 etc.) also contain "내역" but aren't the
// item-level detail sheet we want — only fall back to them if nothing else matches.
const summarySheetKeys = ["총괄", "총합"];

// Korean spreadsheets frequently pad header labels with spaces for visual
// centering (e.g. "공  종", "수 량", "금  액") — strip all whitespace before
// matching keywords, but keep the raw cell text for actual data values.
function normCell(c: unknown): string {
  return String(c || "").replace(/\s+/g, "");
}

function findCol(row: string[], keys: string[]) {
  return row.findIndex((cell) => keys.some((k) => cell.includes(k)));
}

// Unlike findCol (leftmost column matching ANY key), this checks keys in
// priority order across ALL columns — so "품명" wins over "공종" even when
// "공종" sits in an earlier column.
function findNameCol(row: string[], keys: string[]) {
  for (const key of keys) {
    const idx = row.findIndex((cell) => cell.includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Some 내역서 layouts split the header across two rows: row N has
// 공종/규격/수량/단위, row N+1 has 단가/금액 (merged-cell sub-headers).
// Scan a small window below the name row and take the first match per column.
function findHeaderRow(aoa: string[][]): { headerRowIdx: number; cols: Record<string, number> } | null {
  const WINDOW = 3;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row0 = (aoa[i] || []).map(normCell);
    const nameIdx = findNameCol(row0, nameKeys);
    if (nameIdx < 0) continue;

    const cols = { spec: -1, unit: -1, qty: -1, price: -1, amount: -1 };
    let lastOffset = 0;
    for (let w = 0; w < WINDOW; w++) {
      const row = (aoa[i + w] || []).map(normCell);
      const matches: [keyof typeof cols, string[]][] = [
        ["spec", specKeys],
        ["unit", unitKeys],
        ["qty", qtyKeys],
        ["price", priceKeys],
        ["amount", amountKeys],
      ];
      for (const [key, keys] of matches) {
        if (cols[key] < 0) {
          const idx = findCol(row, keys);
          if (idx >= 0) {
            cols[key] = idx;
            lastOffset = Math.max(lastOffset, w);
          }
        }
      }
    }

    if (cols.amount >= 0 || cols.qty >= 0) {
      return { headerRowIdx: i + lastOffset, cols: { name: nameIdx, ...cols } };
    }
  }
  return null;
}

function extractItems(
  aoa: string[][],
  headerRowIdx: number,
  cols: Record<string, number>
): { items: ParsedWorkItem[]; total: number } {
  const items: ParsedWorkItem[] = [];
  let total = 0;
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row || row.length === 0) continue;
    const rawName = String(row[cols.name] || "").trim();
    if (!rawName) continue;
    // Exact match only — a substring check would also reject legitimate item
    // names that happen to contain "계" as a syllable (e.g. 경계석, 온도계).
    const rawNameNorm = normCell(rawName);
    if (skipNameKeys.some((k) => rawNameNorm === k)) continue;

    const qty = cols.qty >= 0 ? Number(String(row[cols.qty]).replace(/,/g, "")) || 0 : 0;
    const unit = cols.unit >= 0 ? String(row[cols.unit] || "").trim() : "";
    const unitPrice = cols.price >= 0 ? Number(String(row[cols.price]).replace(/,/g, "")) || 0 : 0;
    let amount = cols.amount >= 0 ? Number(String(row[cols.amount]).replace(/,/g, "")) || 0 : 0;
    if (!amount && qty && unitPrice) amount = qty * unitPrice;
    if (!amount) continue;

    // Hierarchical 내역서 layouts mix category/subtotal rows (no unit, qty=0)
    // in with real line items. When both columns are present, only count
    // rows that look like actual items — otherwise subtotals get double-counted.
    if (cols.unit >= 0 && cols.qty >= 0 && (!unit || qty <= 0)) continue;

    items.push({
      name: rawName,
      spec: cols.spec >= 0 ? String(row[cols.spec] || "").trim() : "",
      unit,
      qty,
      unitPrice,
      amount,
    });
    total += amount;
  }
  return { items, total };
}

/**
 * Construction estimate files (착공내역서) commonly bundle many sheets
 * (표지, 총괄내역서, 내역서, 단가산출서, 수량산출서, 일위대가 ...).
 * We only want the item-level 내역서 sheet, not price/quantity buildup
 * sheets that can have similar-looking column headers.
 */
function pickSheetName(wb: XLSX.WorkBook): string {
  const nameCandidates = wb.SheetNames.filter(
    (n) => n.includes("내역") && !excludeSheetKeys.some((k) => n.includes(k))
  );

  // Prefer a detail sheet (내역서) over a 공종별 summary sheet (총괄내역서 등).
  const detailCandidates = nameCandidates.filter((n) => !summarySheetKeys.some((k) => n.includes(k)));
  if (detailCandidates.length > 0) {
    return detailCandidates.find((n) => n === "내역서") || detailCandidates[0];
  }
  if (nameCandidates.length > 0) return nameCandidates[0];

  // No name match — fall back to the first sheet that actually parses.
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: "" });
    if (findHeaderRow(aoa)) return name;
  }
  return wb.SheetNames[0];
}

export function parseWorkItemsBuffer(buf: Buffer): ParsedWorkbook {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = pickSheetName(wb);
  const aoa: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });

  const header = findHeaderRow(aoa);
  if (!header) return { items: [], total: 0, sheetName };

  const { items, total } = extractItems(aoa, header.headerRowIdx, header.cols);
  return { items, total, sheetName };
}
