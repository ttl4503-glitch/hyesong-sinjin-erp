import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { COMPANIES } from "@/lib/erp";
import { getReqUser } from "@/lib/authServer";
import type { Vendor, EquipmentVendor } from "@prisma/client";

interface MainAgg {
  projectName: string;
  vendor: string; // 업체명/상호명 (장비·자재·운반비 통합)
  amount: number;
}

interface EquipAgg {
  projectName: string;
  name: string; // 장비명
  jobType: string; // 이름 (운전자)
  vendor: string; // 상호
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

function buildVendorSheet(
  scopeLabel: string,
  month: string,
  nameHeader: string,
  agg: Record<string, VendorAgg>,
  vendorMap: Map<string, Vendor>
) {
  const rows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    [
      nameHeader,
      "업체명",
      "사업자등록번호",
      "대표자성명",
      "담당자성명",
      "전화번호",
      "휴대폰",
      "은행명",
      "계좌번호",
      "이메일",
      "금액 합계(원)",
      "세금계산서",
    ],
  ];
  let total = 0;
  Object.values(agg)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((v) => {
      const vendorInfo = vendorMap.get(v.vendor.trim());
      rows.push([
        v.name,
        v.vendor,
        vendorInfo?.bizRegNo || "",
        vendorInfo?.ceoName || "",
        vendorInfo?.managerName || "",
        vendorInfo?.phone || "",
        vendorInfo?.mobile || "",
        vendorInfo?.bankName || "",
        vendorInfo?.account || "",
        vendorInfo?.email || "",
        v.totalAmount,
        taxLabel(v.taxYes, v.taxNo),
      ]);
      total += v.totalAmount;
    });
  rows.push(["총 합계", "", "", "", "", "", "", "", "", "", total, ""]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
  ];
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

  const mainAgg: Record<string, MainAgg> = {};
  const equipment: Record<string, EquipAgg> = {};
  const materials: Record<string, VendorAgg> = {};
  const freight: Record<string, VendorAgg> = {};

  projects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      if (l.type !== "장비" && l.type !== "자재" && l.type !== "운반비") return;
      if (month && (l.date || "").slice(0, 7) !== month) return;

      const vendorText = (l.vendor || "").trim();
      const mainKey = `${p.id}||${vendorText}`;
      if (!mainAgg[mainKey]) {
        mainAgg[mainKey] = { projectName: p.name, vendor: vendorText, amount: 0 };
      }
      mainAgg[mainKey].amount += l.amount;

      if (l.type === "장비") {
        const key = `${p.id}||${l.name}||${l.jobType}||${vendorText}`;
        if (!equipment[key]) {
          equipment[key] = {
            projectName: p.name,
            name: l.name,
            jobType: l.jobType,
            vendor: vendorText,
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

  // 메인 시트: 현장별로 업체(상호)당 합계금액만 — 세부 내역은 아래 상세 시트에서 확인
  const mainRows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["현장명", "업체명/상호명", "합계금액(원)"],
  ];
  let mainTotal = 0;
  Object.values(mainAgg)
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.vendor.localeCompare(b.vendor))
    .forEach((m) => {
      mainRows.push([m.projectName, m.vendor || "(업체명 미입력)", m.amount]);
      mainTotal += m.amount;
    });
  mainRows.push(["총 합계", "", mainTotal]);

  const ws = XLSX.utils.aoa_to_sheet(mainRows);
  ws["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 16 }];

  const equipmentVendors = await prisma.equipmentVendor.findMany({ where: { deletedAt: null } });
  const equipVendorMap = new Map<string, EquipmentVendor>(equipmentVendors.map((v) => [v.name.trim(), v]));

  const equipRows: (string | number)[][] = [
    [`집계 범위: ${scopeLabel}${month ? " · " + month : " · 전체기간"}`],
    ["현장명", "장비명", "상호", "이름", "단가", "공수", "금액(원)", "사업자등록번호", "휴대폰", "은행명", "계좌번호", "이메일", "세금계산서"],
  ];
  let eqTotalQty = 0;
  let eqTotalAmount = 0;
  Object.values(equipment)
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.name.localeCompare(b.name))
    .forEach((eq) => {
      const rateLabel = eq.rates.size === 1 ? Array.from(eq.rates)[0] : Array.from(eq.rates).join(" / ");
      const info = equipVendorMap.get(eq.vendor.trim());
      equipRows.push([
        eq.projectName,
        eq.name,
        eq.vendor,
        eq.jobType,
        rateLabel,
        eq.totalQty,
        eq.totalAmount,
        info?.bizRegNo || "",
        info?.mobile || "",
        info?.bankName || "",
        info?.account || "",
        info?.email || "",
        taxLabel(eq.taxYes, eq.taxNo),
      ]);
      eqTotalQty += eq.totalQty;
      eqTotalAmount += eq.totalAmount;
    });
  equipRows.push(["총 합계", "", "", "", "", eqTotalQty, eqTotalAmount, "", "", "", "", "", ""]);

  const wsEquip = XLSX.utils.aoa_to_sheet(equipRows);
  wsEquip["!cols"] = [
    { wch: 24 },
    { wch: 18 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
  ];

  const vendors = await prisma.vendor.findMany({ where: { deletedAt: null } });
  const vendorMap = new Map(vendors.map((v) => [v.name.trim(), v]));

  const wsMaterial = buildVendorSheet(scopeLabel, month, "자재명", materials, vendorMap);
  const wsFreight = buildVendorSheet(scopeLabel, month, "운반비 항목", freight, vendorMap);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "장비자재운반비집계");
  XLSX.utils.book_append_sheet(wb, wsEquip, "장비상세");
  XLSX.utils.book_append_sheet(wb, wsMaterial, "자재상세(거래처)");
  XLSX.utils.book_append_sheet(wb, wsFreight, "운반비상세(거래처)");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const label = month || "전체기간";
  const filename = encodeURIComponent(`${scopeLabel}_장비자재운반비집계_${label}_${today}.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
