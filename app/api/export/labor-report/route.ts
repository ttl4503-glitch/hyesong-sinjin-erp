import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

interface PersonAgg {
  name: string;
  jobType: string;
  days: Set<string>;
  rates: Set<number>;
  totalQty: number;
  totalAmount: number;
}

// 노무비 신고용 집계 — 혜송/신진 두 회사를 합산해서, 사람별로 근무일수·근무날짜·단가·
// 총금액을 뽑고, 인원 명부(주민번호 앞자리/계좌번호)를 매칭해 붙여준다. 장비·자재는
// 이 리포트의 목적(노무비 신고)에 해당하지 않으므로 제외한다.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || ""; // "YYYY-MM"

  const projects = await prisma.project.findMany({ include: { laborLogs: true } });
  const workers = await prisma.worker.findMany();
  const workerByName = new Map(workers.map((w) => [w.name, w]));

  const people: Record<string, PersonAgg> = {};

  projects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      if (l.type !== "인력") return;
      if (month && (l.date || "").slice(0, 7) !== month) return;

      const key = l.name;
      if (!people[key]) {
        people[key] = { name: l.name, jobType: l.jobType, days: new Set(), rates: new Set(), totalQty: 0, totalAmount: 0 };
      }
      const agg = people[key];
      if (l.date) agg.days.add(l.date);
      if (l.rate) agg.rates.add(l.rate);
      agg.totalQty += l.qty;
      agg.totalAmount += l.amount;
      if (l.jobType) agg.jobType = l.jobType;
    });
  });

  const rows: (string | number)[][] = [
    ["이름", "직종", "근무일수", "근무날짜", "단가", "총공수", "총금액(원)", "주민번호앞자리", "은행", "계좌번호"],
  ];

  let totalDays = 0;
  let totalQty = 0;
  let totalAmount = 0;

  Object.values(people)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((r) => {
      const w = workerByName.get(r.name);
      const sortedDays = Array.from(r.days).sort();
      const rateLabel = r.rates.size === 1 ? Array.from(r.rates)[0] : Array.from(r.rates).join(" / ");
      rows.push([
        r.name,
        r.jobType,
        sortedDays.length,
        sortedDays.join(", "),
        rateLabel,
        r.totalQty,
        r.totalAmount,
        w?.idFront || "",
        w?.bankName || "",
        w?.account || "",
      ]);
      totalDays += sortedDays.length;
      totalQty += r.totalQty;
      totalAmount += r.totalAmount;
    });

  rows.push(["총 합계", "", totalDays, "", "", totalQty, totalAmount, "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 40 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "노무비집계");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const label = month || "전체기간";
  const filename = encodeURIComponent(`혜송신진_노무비신고집계_${label}_${today}.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
