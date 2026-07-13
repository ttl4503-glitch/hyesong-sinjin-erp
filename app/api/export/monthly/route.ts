import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

interface Row {
  name: string;
  pGongsu: number;
  pCost: number;
  eGongsu: number;
  eCost: number;
  materialCost: number;
  mealCost: number;
  miscCost: number;
}

function emptyRow(name: string): Row {
  return { name, pGongsu: 0, pCost: 0, eGongsu: 0, eCost: 0, materialCost: 0, mealCost: 0, miscCost: 0 };
}

function rowTotal(r: Row) {
  return r.pCost + r.eCost + r.materialCost + r.mealCost + r.miscCost;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get("company") || "";

  const projects = await prisma.project.findMany({
    where: company ? { company } : undefined,
    include: { laborLogs: true },
  });

  const monthly: Record<string, Record<string, Row>> = {};

  projects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      const month = (l.date || "").slice(0, 7) || "날짜미상";
      if (!monthly[month]) monthly[month] = {};
      if (!monthly[month][p.id]) monthly[month][p.id] = emptyRow(p.name);
      const row = monthly[month][p.id];
      if (l.type === "인력") {
        row.pGongsu += l.qty;
        row.pCost += l.amount;
      } else if (l.type === "장비") {
        row.eGongsu += l.qty;
        row.eCost += l.amount;
      } else if (l.type === "자재") {
        row.materialCost += l.amount;
      } else if (l.type === "식대") {
        row.mealCost += l.amount;
      } else if (l.type === "잡자재") {
        row.miscCost += l.amount;
      }
    });
  });

  const months = Object.keys(monthly).sort();
  const rows: (string | number)[][] = [];
  rows.push([
    "월",
    "현장명",
    "인력 공수",
    "인력 비용(원)",
    "장비 공수",
    "장비 비용(원)",
    "자재 비용(원)",
    "식대 비용(원)",
    "잡자재 비용(원)",
    "합계 비용(원)",
  ]);

  const grand = emptyRow("");

  months.forEach((month) => {
    const projRows = Object.values(monthly[month]).sort((a, b) => a.name.localeCompare(b.name));
    const sub = emptyRow("");
    projRows.forEach((r) => {
      rows.push([
        month,
        r.name,
        r.pGongsu,
        r.pCost,
        r.eGongsu,
        r.eCost,
        r.materialCost,
        r.mealCost,
        r.miscCost,
        rowTotal(r),
      ]);
      sub.pGongsu += r.pGongsu;
      sub.pCost += r.pCost;
      sub.eGongsu += r.eGongsu;
      sub.eCost += r.eCost;
      sub.materialCost += r.materialCost;
      sub.mealCost += r.mealCost;
      sub.miscCost += r.miscCost;
    });
    rows.push([
      "",
      "소계(전체 현장)",
      sub.pGongsu,
      sub.pCost,
      sub.eGongsu,
      sub.eCost,
      sub.materialCost,
      sub.mealCost,
      sub.miscCost,
      rowTotal(sub),
    ]);
    rows.push([]);
    grand.pGongsu += sub.pGongsu;
    grand.pCost += sub.pCost;
    grand.eGongsu += sub.eGongsu;
    grand.eCost += sub.eCost;
    grand.materialCost += sub.materialCost;
    grand.mealCost += sub.mealCost;
    grand.miscCost += sub.miscCost;
  });

  rows.push([
    "총 합계",
    "전체 기간 · 전체 현장",
    grand.pGongsu,
    grand.pCost,
    grand.eGongsu,
    grand.eCost,
    grand.materialCost,
    grand.mealCost,
    grand.miscCost,
    rowTotal(grand),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 22 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "월별집계");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const filename = encodeURIComponent(`${company || "전체"}_월별집계_${today}.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
