import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { COMPANIES } from "@/lib/erp";
import { getReqUser } from "@/lib/authServer";

interface Row {
  name: string;
  eGongsu: number;
  eCost: number;
  materialCost: number;
  freightCost: number;
}

function emptyRow(name: string): Row {
  return { name, eGongsu: 0, eCost: 0, materialCost: 0, freightCost: 0 };
}

function rowTotal(r: Row) {
  return r.eCost + r.materialCost + r.freightCost;
}

interface EquipAgg {
  name: string;
  jobType: string;
  rates: Set<number>;
  totalQty: number;
  totalAmount: number;
  taxYes: number;
  taxNo: number;
}

interface VendorAgg {
  name: string;
  vendor: string;
  totalAmount: number;
  taxYes: number;
  taxNo: number;
}

function taxLabel(taxYes: number, taxNo: number) {
  if (taxYes > 0 && taxNo > 0) return `발행 ${taxYes}건 / 미발행 ${taxNo}건`;
  return taxYes > 0 ? "발행" : "미발행";
}

function buildVendorSheet(scopeLabel: string, month: string, nameHeader: string, agg: Record<string, VendorAgg>) {
  const rows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    [nameHeader, "업체명", "금액 합계(원)", "세금계산서"],
  ];
  let total = 0;
  Object.values(agg)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((v) => {
      rows.push([v.name, v.vendor, v.totalAmount, taxLabel(v.taxYes, v.taxNo)]);
      total += v.totalAmount;
    });
  rows.push(["총 합계", "", total, ""]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 20 }];
  return ws;
}

// 장비·자재·운반비 집계 — 인력은 노무비 신고용 집계에서 따로 다루므로 여기서는
// 장비 사용료·자재대·운반비만 뽑는다. month가 주어지면 그 달만, 없으면 전체 기간.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || ""; // "YYYY-MM"
  const scope = searchParams.get("scope") || "all"; // "all" | "company" | "project"
  const company = searchParams.get("company") || "";
  const projectId = searchParams.get("projectId") || "";

  const reqUser = await getReqUser(req);
  const isAdmin = !!reqUser?.isAdmin;

  let projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: { laborLogs: { where: { deletedAt: null } } },
  });
  if (!isAdmin) {
    const allowed = new Set(reqUser?.projectIds || []);
    projects = projects.filter((p) => allowed.has(p.id));
  }
  let scopeLabel = isAdmin ? `전체(${COMPANIES.join("+")})` : "내 담당 현장";
  if (scope === "company" && company) {
    projects = projects.filter((p) => p.company === company);
    scopeLabel = isAdmin ? company : `${company} (내 담당 현장)`;
  } else if (scope === "project" && projectId) {
    const proj = projects.find((p) => p.id === projectId);
    projects = proj ? [proj] : [];
    scopeLabel = proj ? proj.name : "현장";
  }

  const byProject: Record<string, Row> = {};
  const equipment: Record<string, EquipAgg> = {};
  const materials: Record<string, VendorAgg> = {};
  const freight: Record<string, VendorAgg> = {};

  projects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      if (l.type !== "장비" && l.type !== "자재" && l.type !== "운반비") return;
      if (month && (l.date || "").slice(0, 7) !== month) return;

      if (!byProject[p.id]) byProject[p.id] = emptyRow(p.name);
      const row = byProject[p.id];

      if (l.type === "장비") {
        row.eGongsu += l.qty;
        row.eCost += l.amount;

        const key = `${l.name}||${l.jobType}`;
        if (!equipment[key]) {
          equipment[key] = {
            name: l.name,
            jobType: l.jobType,
            rates: new Set(),
            totalQty: 0,
            totalAmount: 0,
            taxYes: 0,
            taxNo: 0,
          };
        }
        const eq = equipment[key];
        if (l.rate) eq.rates.add(l.rate);
        eq.totalQty += l.qty;
        eq.totalAmount += l.amount;
        if (l.taxInvoice) eq.taxYes += 1;
        else eq.taxNo += 1;
      } else {
        const bucket = l.type === "자재" ? materials : freight;
        if (l.type === "자재") row.materialCost += l.amount;
        else row.freightCost += l.amount;

        const key = `${l.name}||${l.vendor}`;
        if (!bucket[key]) {
          bucket[key] = { name: l.name, vendor: l.vendor, totalAmount: 0, taxYes: 0, taxNo: 0 };
        }
        const v = bucket[key];
        v.totalAmount += l.amount;
        if (l.taxInvoice) v.taxYes += 1;
        else v.taxNo += 1;
      }
    });
  });

  const rows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["현장명", "장비 공수", "장비 비용(원)", "자재대(원)", "운반비(원)", "합계 비용(원)"],
  ];

  const grand = emptyRow("");
  Object.values(byProject)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((r) => {
      rows.push([r.name, r.eGongsu, r.eCost, r.materialCost, r.freightCost, rowTotal(r)]);
      grand.eGongsu += r.eGongsu;
      grand.eCost += r.eCost;
      grand.materialCost += r.materialCost;
      grand.freightCost += r.freightCost;
    });

  rows.push(["총 합계", grand.eGongsu, grand.eCost, grand.materialCost, grand.freightCost, rowTotal(grand)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const equipRows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["장비명", "이름", "단가", "공수", "합계금액(원)", "세금계산서"],
  ];
  let eqTotalQty = 0;
  let eqTotalAmount = 0;
  Object.values(equipment)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((eq) => {
      const rateLabel = eq.rates.size === 1 ? Array.from(eq.rates)[0] : Array.from(eq.rates).join(" / ");
      equipRows.push([eq.name, eq.jobType, rateLabel, eq.totalQty, eq.totalAmount, taxLabel(eq.taxYes, eq.taxNo)]);
      eqTotalQty += eq.totalQty;
      eqTotalAmount += eq.totalAmount;
    });
  equipRows.push(["총 합계", "", "", eqTotalQty, eqTotalAmount, ""]);

  const wsEquip = XLSX.utils.aoa_to_sheet(equipRows);
  wsEquip["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 20 }];

  const wsMaterial = buildVendorSheet(scopeLabel, month, "자재명", materials);
  const wsFreight = buildVendorSheet(scopeLabel, month, "운반비 항목", freight);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "장비자재집계");
  XLSX.utils.book_append_sheet(wb, wsEquip, "장비상세");
  XLSX.utils.book_append_sheet(wb, wsMaterial, "자재상세");
  XLSX.utils.book_append_sheet(wb, wsFreight, "운반비상세");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const label = month || "전체기간";
  const filename = encodeURIComponent(`${scopeLabel}_장비자재집계_${label}_${today}.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
