import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

interface PersonAgg {
  name: string;
  jobType: string;
  qty: number;
  amount: number;
  sites: Set<string>;
  days: Set<string>;
}

interface EquipAgg {
  name: string;
  qty: number;
  amount: number;
  sites: Set<string>;
}

interface MaterialAgg {
  name: string;
  type: string;
  issuedAmount: number;
  pendingAmount: number;
  sites: Set<string>;
}

// Aggregates labor logs by person / equipment / material vendor — for
// wage (노무비) and tax-invoice reporting, which is done per-person and
// per-vendor across all sites, not per-project.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get("company") || "";
  const month = searchParams.get("month") || ""; // "YYYY-MM"

  const projects = await prisma.project.findMany({
    where: company ? { company } : undefined,
    include: { laborLogs: true },
  });

  const people: Record<string, PersonAgg> = {};
  const equip: Record<string, EquipAgg> = {};
  const materials: Record<string, MaterialAgg> = {};

  projects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      if (month && (l.date || "").slice(0, 7) !== month) return;

      if (l.type === "인력") {
        const key = l.name;
        if (!people[key]) people[key] = { name: l.name, jobType: l.jobType, qty: 0, amount: 0, sites: new Set(), days: new Set() };
        people[key].qty += l.qty;
        people[key].amount += l.amount;
        people[key].sites.add(p.name);
        if (l.date) people[key].days.add(l.date);
        if (l.jobType) people[key].jobType = l.jobType;
      } else if (l.type === "장비") {
        const key = l.name;
        if (!equip[key]) equip[key] = { name: l.name, qty: 0, amount: 0, sites: new Set() };
        equip[key].qty += l.qty;
        equip[key].amount += l.amount;
        equip[key].sites.add(p.name);
      } else if (l.type === "자재" || l.type === "식대" || l.type === "잡자재") {
        const key = `${l.type}::${l.name}`;
        if (!materials[key]) materials[key] = { name: l.name, type: l.type, issuedAmount: 0, pendingAmount: 0, sites: new Set() };
        if (l.taxInvoice) materials[key].issuedAmount += l.amount;
        else materials[key].pendingAmount += l.amount;
        materials[key].sites.add(p.name);
      }
    });
  });

  const wb = XLSX.utils.book_new();

  const personRows: (string | number)[][] = [
    ["이름", "직종", "총 공수", "총 금액(원)", "참여 현장 수", "참여 일수"],
  ];
  let personTotalQty = 0;
  let personTotalAmount = 0;
  Object.values(people)
    .sort((a, b) => b.amount - a.amount)
    .forEach((r) => {
      personRows.push([r.name, r.jobType, r.qty, r.amount, r.sites.size, r.days.size]);
      personTotalQty += r.qty;
      personTotalAmount += r.amount;
    });
  personRows.push(["총 합계", "", personTotalQty, personTotalAmount, "", ""]);
  const wsPerson = XLSX.utils.aoa_to_sheet(personRows);
  wsPerson["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsPerson, "인력별집계");

  const equipRows: (string | number)[][] = [["장비명", "총 공수", "총 금액(원)", "참여 현장 수"]];
  let equipTotalQty = 0;
  let equipTotalAmount = 0;
  Object.values(equip)
    .sort((a, b) => b.amount - a.amount)
    .forEach((r) => {
      equipRows.push([r.name, r.qty, r.amount, r.sites.size]);
      equipTotalQty += r.qty;
      equipTotalAmount += r.amount;
    });
  equipRows.push(["총 합계", equipTotalQty, equipTotalAmount, ""]);
  const wsEquip = XLSX.utils.aoa_to_sheet(equipRows);
  wsEquip["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsEquip, "장비별집계");

  const materialRows: (string | number)[][] = [
    ["구분", "품목/업체명", "계산서 발행(원)", "계산서 미발행(원)", "합계(원)", "참여 현장 수"],
  ];
  let matIssued = 0;
  let matPending = 0;
  Object.values(materials)
    .sort((a, b) => b.issuedAmount + b.pendingAmount - (a.issuedAmount + a.pendingAmount))
    .forEach((r) => {
      materialRows.push([r.type, r.name, r.issuedAmount, r.pendingAmount, r.issuedAmount + r.pendingAmount, r.sites.size]);
      matIssued += r.issuedAmount;
      matPending += r.pendingAmount;
    });
  materialRows.push(["총 합계", "", matIssued, matPending, matIssued + matPending, ""]);
  const wsMaterial = XLSX.utils.aoa_to_sheet(materialRows);
  wsMaterial["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsMaterial, "자재식대집계");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const today = new Date().toISOString().slice(0, 10);
  const label = month || "전체기간";
  const filename = encodeURIComponent(`${company || "전체"}_노무비신고집계_${label}_${today}.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
