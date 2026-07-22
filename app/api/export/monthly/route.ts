import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { COMPANIES } from "@/lib/erp";

interface Row {
  name: string;
  eGongsu: number;
  eCost: number;
  materialCost: number;
}

function emptyRow(name: string): Row {
  return { name, eGongsu: 0, eCost: 0, materialCost: 0 };
}

function rowTotal(r: Row) {
  return r.eCost + r.materialCost;
}

interface EquipAgg {
  name: string;
  jobType: string;
  rates: Set<number>;
  totalQty: number;
  totalAmount: number;
}

interface MaterialAgg {
  name: string;
  vendor: string;
  totalAmount: number;
  taxYes: number;
  taxNo: number;
}

// 장비·자재 집계 — 인력은 노무비 신고용 집계에서 따로 다루므로 여기서는
// 장비 사용료와 자재대만 뽑는다. month가 주어지면 그 달만, 없으면 전체 기간.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || ""; // "YYYY-MM"
  const scope = searchParams.get("scope") || "all"; // "all" | "company" | "project"
  const company = searchParams.get("company") || "";
  const projectId = searchParams.get("projectId") || "";

  let projects = await prisma.project.findMany({ include: { laborLogs: true } });
  let scopeLabel = `전체(${COMPANIES.join("+")})`;
  if (scope === "company" && company) {
    projects = projects.filter((p) => p.company === company);
    scopeLabel = company;
  } else if (scope === "project" && projectId) {
    const proj = projects.find((p) => p.id === projectId);
    projects = proj ? [proj] : [];
    scopeLabel = proj ? proj.name : "현장";
  }

  const byProject: Record<string, Row> = {};
  const equipment: Record<string, EquipAgg> = {};
  const materials: Record<string, MaterialAgg> = {};

  projects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      if (l.type !== "장비" && l.type !== "자재") return;
      if (month && (l.date || "").slice(0, 7) !== month) return;

      if (!byProject[p.id]) byProject[p.id] = emptyRow(p.name);
      const row = byProject[p.id];
      if (l.type === "장비") {
        row.eGongsu += l.qty;
        row.eCost += l.amount;

        const key = `${l.name}||${l.jobType}`;
        if (!equipment[key]) {
          equipment[key] = { name: l.name, jobType: l.jobType, rates: new Set(), totalQty: 0, totalAmount: 0 };
        }
        const eq = equipment[key];
        if (l.rate) eq.rates.add(l.rate);
        eq.totalQty += l.qty;
        eq.totalAmount += l.amount;
      } else {
        row.materialCost += l.amount;

        const key = `${l.name}||${l.vendor}`;
        if (!materials[key]) {
          materials[key] = { name: l.name, vendor: l.vendor, totalAmount: 0, taxYes: 0, taxNo: 0 };
        }
        const mat = materials[key];
        mat.totalAmount += l.amount;
        if (l.taxInvoice) mat.taxYes += 1;
        else mat.taxNo += 1;
      }
    });
  });

  const rows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["현장명", "장비 공수", "장비 비용(원)", "자재대(원)", "합계 비용(원)"],
  ];

  const grand = emptyRow("");
  Object.values(byProject)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((r) => {
      rows.push([r.name, r.eGongsu, r.eCost, r.materialCost, rowTotal(r)]);
      grand.eGongsu += r.eGongsu;
      grand.eCost += r.eCost;
      grand.materialCost += r.materialCost;
    });

  rows.push(["총 합계", grand.eGongsu, grand.eCost, grand.materialCost, rowTotal(grand)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const equipRows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["장비명", "이름", "단가", "공수", "합계금액(원)"],
  ];
  let eqTotalQty = 0;
  let eqTotalAmount = 0;
  Object.values(equipment)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((eq) => {
      const rateLabel = eq.rates.size === 1 ? Array.from(eq.rates)[0] : Array.from(eq.rates).join(" / ");
      equipRows.push([eq.name, eq.jobType, rateLabel, eq.totalQty, eq.totalAmount]);
      eqTotalQty += eq.totalQty;
      eqTotalAmount += eq.totalAmount;
    });
  equipRows.push(["총 합계", "", "", eqTotalQty, eqTotalAmount]);

  const wsEquip = XLSX.utils.aoa_to_sheet(equipRows);
  wsEquip["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];

  const materialRows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["자재명", "업체명", "금액 합계(원)", "세금계산서"],
  ];
  let matTotalAmount = 0;
  Object.values(materials)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((mat) => {
      const taxLabel =
        mat.taxYes > 0 && mat.taxNo > 0
          ? `발행 ${mat.taxYes}건 / 미발행 ${mat.taxNo}건`
          : mat.taxYes > 0
          ? "발행"
          : "미발행";
      materialRows.push([mat.name, mat.vendor, mat.totalAmount, taxLabel]);
      matTotalAmount += mat.totalAmount;
    });
  materialRows.push(["총 합계", "", matTotalAmount, ""]);

  const wsMaterial = XLSX.utils.aoa_to_sheet(materialRows);
  wsMaterial["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "장비자재집계");
  XLSX.utils.book_append_sheet(wb, wsEquip, "장비상세");
  XLSX.utils.book_append_sheet(wb, wsMaterial, "자재상세");
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
