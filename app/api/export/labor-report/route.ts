import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { COMPANIES } from "@/lib/erp";
import { getReqUser } from "@/lib/authServer";

// 실제 회계팀 "일용임금대장" 양식을 그대로 재현한다 (\\172.30.1.200\98. 회계\일용직\일용임금대장).
// 사람×단가 조합마다 2행(1~15일 / 16~30일)을 쓰고, 근무일수·일당·총액·차인지급액과 공제
// 관련 수식(갑근세/주민세/건강보험/장기요양/고용보험/공제계)을 실제 파일에서 확인한 그대로
// 셀 수식으로 심어 넣는다. 국민연금은 실제 파일에서도 값이 채워지지 않는 칸이라 비워둔다.
// 31일이 있는 달도 실제 양식처럼 16~30일까지만 칸이 있고 31일 근무는 표시할 칸이 없다 —
// 이는 회사가 쓰는 원본 양식 자체의 한계이며, 이 리포트는 그 양식을 그대로 재현한 것이다.

const EXCLUDED_JOB_TYPES = ["식재팀", "직원"];
const DEDUCTION_COLS = { W: 22, X: 23, Y: 24, Z: 25, AA: 26 } as const;
const DAY_COL_START = 3; // column D
const NAME_COL = 1; // column B
const ID_COL = 2; // column C
const DAYS_COL = 19; // column T (근무일수)
const RATE_COL = 20; // column U (일당)
const TOTAL_COL = 21; // column V (총액)

interface PersonGroup {
  name: string;
  rate: number;
  jobType: string;
  days: Set<number>;
}

function addr(r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c });
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function blankRow(width: number): any[] {
  return new Array(width).fill("");
}

const SHEET_WIDTH = 27; // columns A..AA

function buildCompanySheet(companyName: string, month: string, groups: PersonGroup[], rosterLastRow: number) {
  const aoa: any[][] = [];

  aoa.push(blankRow(SHEET_WIDTH)); // row0 (Excel1) blank

  let monthLabel = "";
  let periodLabel = "근무기간";
  let payLabel = "지급일";
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const last = daysInMonth(y, m);
    monthLabel = `${y}년 ${m}월`;
    periodLabel = `근무기간\r\n${y}.${String(m).padStart(2, "0")}.01 ~${y}.${String(m).padStart(2, "0")}.${String(last).padStart(2, "0")}까지`;
    let py = y;
    let pm = m + 1;
    if (pm > 12) {
      pm = 1;
      py += 1;
    }
    payLabel = `지급일\r\n${py}. ${String(pm).padStart(2, "0")}. 14.`;
  }
  const titleRow = blankRow(SHEET_WIDTH);
  titleRow[0] = `${companyName} ［ ${monthLabel} ］ 일용 임금대장`;
  titleRow[DEDUCTION_COLS.W] = periodLabel;
  titleRow[DEDUCTION_COLS.Z] = payLabel;
  aoa.push(titleRow); // row1 (Excel2)

  aoa.push(blankRow(SHEET_WIDTH)); // row2 (Excel3) blank

  const header = blankRow(SHEET_WIDTH);
  header[0] = "순번";
  header[NAME_COL] = "성  명";
  header[ID_COL] = "주민등록번호";
  header[DAY_COL_START] = "근          무          현          황";
  header[DAYS_COL] = "근무\r\n일수";
  header[RATE_COL] = "일  당";
  header[TOTAL_COL] = "총  액";
  header[DEDUCTION_COLS.W] = "공  제  금  액";
  header[DEDUCTION_COLS.AA] = "차인\r\n지급액";
  aoa.push(header); // row3 (Excel4)

  aoa.push(blankRow(SHEET_WIDTH)); // row4 (Excel5) blank

  const sub1 = blankRow(SHEET_WIDTH);
  for (let d = 1; d <= 15; d++) sub1[DAY_COL_START + (d - 1)] = d;
  sub1[DEDUCTION_COLS.W] = "갑근세";
  sub1[DEDUCTION_COLS.X] = "국민연금";
  sub1[DEDUCTION_COLS.Y] = "장기요양";
  sub1[DEDUCTION_COLS.Z] = "공제계";
  aoa.push(sub1); // row5 (Excel6)

  const sub2 = blankRow(SHEET_WIDTH);
  for (let d = 16; d <= 30; d++) sub2[DAY_COL_START + (d - 16)] = d;
  sub2[DEDUCTION_COLS.W] = "주민세";
  sub2[DEDUCTION_COLS.X] = "건강보험";
  sub2[DEDUCTION_COLS.Y] = "고용보험";
  aoa.push(sub2); // row6 (Excel7)

  const firstPersonRow = aoa.length; // 0-indexed row of person #1's row A

  groups.forEach((g, i) => {
    const rowA = blankRow(SHEET_WIDTH);
    const rowB = blankRow(SHEET_WIDTH);
    rowA[0] = i + 1;
    rowA[NAME_COL] = g.name;
    g.days.forEach((d) => {
      if (d >= 1 && d <= 15) rowA[DAY_COL_START + (d - 1)] = 1;
      else if (d >= 16 && d <= 30) rowB[DAY_COL_START + (d - 16)] = 1;
      // 31일은 원본 양식에도 칸이 없어 표시하지 않음
    });
    rowA[RATE_COL] = g.rate;
    aoa.push(rowA);
    aoa.push(rowB);
  });

  const n = groups.length;
  const totalRowA = aoa.length;
  const totalA = blankRow(SHEET_WIDTH);
  totalA[0] = "합        계";
  aoa.push(totalA);
  aoa.push(blankRow(SHEET_WIDTH));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  for (let i = 0; i < n; i++) {
    const rA = firstPersonRow + i * 2;
    const rB = rA + 1;
    const nameAddr = addr(rA, NAME_COL);
    const Taddr = addr(rA, DAYS_COL);
    const Uaddr = addr(rA, RATE_COL);
    const Vaddr = addr(rA, TOTAL_COL);
    const Waddr = addr(rA, DEDUCTION_COLS.W);
    const WBaddr = addr(rB, DEDUCTION_COLS.W);
    const XBaddr = addr(rB, DEDUCTION_COLS.X);
    const Yaddr = addr(rA, DEDUCTION_COLS.Y);
    const YBaddr = addr(rB, DEDUCTION_COLS.Y);
    const Zaddr = addr(rA, DEDUCTION_COLS.Z);
    const AAaddr = addr(rA, DEDUCTION_COLS.AA);

    ws[addr(rA, ID_COL)] = {
      t: "str",
      f: `IF(ISBLANK(${nameAddr}),"",VLOOKUP(${nameAddr},사원명부!$B$2:$C$${rosterLastRow},2,0))`,
    };
    ws[Taddr] = { t: "n", f: `SUM(${addr(rA, DAY_COL_START)}:${addr(rB, DAY_COL_START + 15)})` };
    ws[Vaddr] = { t: "n", f: `${Taddr}*${Uaddr}` };
    ws[Waddr] = { t: "n", f: `IF(${Uaddr}>150000,ROUNDDOWN((${Uaddr}-150000)*2.7%*${Taddr},-1),"0")` };
    ws[WBaddr] = { t: "n", f: `ROUNDDOWN(${Waddr}/10,-1)` };
    ws[XBaddr] = { t: "n", f: `ROUNDDOWN(${Vaddr}*3.595%,-1)` };
    ws[Yaddr] = { t: "n", f: `ROUNDDOWN(${XBaddr}*13.14%,-1)` };
    ws[YBaddr] = { t: "n", f: `ROUNDDOWN(${Vaddr}*0.9%,-1)` };
    ws[Zaddr] = { t: "n", f: `SUM(${Waddr}:${YBaddr})` };
    ws[AAaddr] = { t: "n", f: `${Vaddr}-${Zaddr}` };
  }

  if (n > 0) {
    const firstA = firstPersonRow;
    const lastB = firstPersonRow + n * 2 - 1;
    const rowAList: number[] = [];
    const rowBList: number[] = [];
    for (let i = 0; i < n; i++) {
      rowAList.push(firstPersonRow + i * 2);
      rowBList.push(firstPersonRow + i * 2 + 1);
    }
    ws[addr(totalRowA, TOTAL_COL)] = { t: "n", f: `SUM(${addr(firstA, TOTAL_COL)}:${addr(lastB, TOTAL_COL)})` };
    ws[addr(totalRowA, DEDUCTION_COLS.W)] = { t: "n", f: `SUM(${rowAList.map((r) => addr(r, DEDUCTION_COLS.W)).join(",")})` };
    ws[addr(totalRowA, DEDUCTION_COLS.X)] = { t: "n", f: `SUM(${rowAList.map((r) => addr(r, DEDUCTION_COLS.X)).join(",")})` };
    ws[addr(totalRowA, DEDUCTION_COLS.Y)] = { t: "n", f: `SUM(${rowAList.map((r) => addr(r, DEDUCTION_COLS.Y)).join(",")})` };
    ws[addr(totalRowA, DEDUCTION_COLS.Z)] = { t: "n", f: `SUM(${addr(firstA, DEDUCTION_COLS.Z)}:${addr(lastB, DEDUCTION_COLS.Z)})` };
    ws[addr(totalRowA, DEDUCTION_COLS.AA)] = { t: "n", f: `SUM(${addr(firstA, DEDUCTION_COLS.AA)}:${addr(lastB, DEDUCTION_COLS.AA)})` };
    ws[addr(totalRowA + 1, DEDUCTION_COLS.W)] = { t: "n", f: `SUM(${rowBList.map((r) => addr(r, DEDUCTION_COLS.W)).join(",")})` };
    ws[addr(totalRowA + 1, DEDUCTION_COLS.X)] = { t: "n", f: `SUM(${rowBList.map((r) => addr(r, DEDUCTION_COLS.X)).join(",")})` };
    ws[addr(totalRowA + 1, DEDUCTION_COLS.Y)] = { t: "n", f: `SUM(${rowBList.map((r) => addr(r, DEDUCTION_COLS.Y)).join(",")})` };
  } else {
    ws[addr(totalRowA, TOTAL_COL)] = { t: "n", v: 0 };
    ws[addr(totalRowA, DEDUCTION_COLS.Z)] = { t: "n", v: 0 };
    ws[addr(totalRowA, DEDUCTION_COLS.AA)] = { t: "n", v: 0 };
  }

  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
    { s: { r: 1, c: 0 }, e: { r: 1, c: 21 } },
    { s: { r: 1, c: DEDUCTION_COLS.W }, e: { r: 1, c: DEDUCTION_COLS.Y } },
    { s: { r: 1, c: DEDUCTION_COLS.Z }, e: { r: 1, c: DEDUCTION_COLS.AA } },
    { s: { r: 3, c: 0 }, e: { r: 6, c: 0 } },
    { s: { r: 3, c: NAME_COL }, e: { r: 6, c: NAME_COL } },
    { s: { r: 3, c: ID_COL }, e: { r: 6, c: ID_COL } },
    { s: { r: 3, c: DAY_COL_START }, e: { r: 4, c: DAY_COL_START + 15 } },
    { s: { r: 3, c: DAYS_COL }, e: { r: 6, c: DAYS_COL } },
    { s: { r: 3, c: RATE_COL }, e: { r: 6, c: RATE_COL } },
    { s: { r: 3, c: TOTAL_COL }, e: { r: 6, c: TOTAL_COL } },
    { s: { r: 3, c: DEDUCTION_COLS.W }, e: { r: 4, c: DEDUCTION_COLS.Z } },
    { s: { r: 3, c: DEDUCTION_COLS.AA }, e: { r: 6, c: DEDUCTION_COLS.AA } },
  ];
  for (let i = 0; i < n; i++) {
    const rA = firstPersonRow + i * 2;
    const rB = rA + 1;
    [0, NAME_COL, ID_COL, DAYS_COL, RATE_COL, TOTAL_COL, DEDUCTION_COLS.Z, DEDUCTION_COLS.AA].forEach((c) =>
      merges.push({ s: { r: rA, c }, e: { r: rB, c } })
    );
  }
  merges.push({ s: { r: totalRowA, c: 0 }, e: { r: totalRowA + 1, c: 0 } });
  ws["!merges"] = merges;
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRowA + 1, c: SHEET_WIDTH - 1 } });

  return { ws, totalRow: totalRowA };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || ""; // "YYYY-MM"
  const scope = searchParams.get("scope") || "all"; // "all" | "company" | "project"
  const company = searchParams.get("company") || "";
  const projectId = searchParams.get("projectId") || "";

  const reqUser = await getReqUser(req);
  const isAdmin = !!reqUser?.isAdmin;

  let projects = await prisma.project.findMany({ include: { laborLogs: true } });
  if (!isAdmin) {
    const allowed = new Set(reqUser?.projectIds || []);
    projects = projects.filter((p) => allowed.has(p.id));
  }
  if (scope === "company" && company) {
    projects = projects.filter((p) => p.company === company);
  } else if (scope === "project" && projectId) {
    const proj = projects.find((p) => p.id === projectId);
    projects = proj ? [proj] : [];
  }

  // 회사별 · (이름,단가) 조합별로 근무일(day-of-month) 집합을 모은다 — 같은 사람이
  // 이 달에 서로 다른 일당으로 일했으면 실제 양식처럼 별도 행 블록으로 나뉜다.
  const byCompany: Record<string, Map<string, PersonGroup>> = {};
  COMPANIES.forEach((c) => (byCompany[c] = new Map()));

  projects.forEach((p) => {
    if (!byCompany[p.company]) byCompany[p.company] = new Map();
    const map = byCompany[p.company];
    p.laborLogs.forEach((l) => {
      if (l.type !== "인력") return;
      if (EXCLUDED_JOB_TYPES.includes(l.jobType)) return;
      if (month && (l.date || "").slice(0, 7) !== month) return;
      const day = Number((l.date || "").slice(8, 10));
      if (!day) return;

      const key = `${l.name}|${l.rate}`;
      if (!map.has(key)) {
        map.set(key, { name: l.name, rate: l.rate, jobType: l.jobType, days: new Set() });
      }
      map.get(key)!.days.add(day);
    });
  });

  const workers = await prisma.worker.findMany({ orderBy: { name: "asc" } });
  const rosterLastRow = 2 + workers.length;

  const wb = XLSX.utils.book_new();

  const companyTotalRows: { company: string; sheetName: string; totalRow: number }[] = [];
  COMPANIES.forEach((c) => {
    const groups = Array.from((byCompany[c] || new Map()).values());
    const sheetName = `${c}(주)`.slice(0, 31);
    const { ws, totalRow } = buildCompanySheet(c, month, groups, rosterLastRow);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    companyTotalRows.push({ company: c, sheetName, totalRow });
  });

  // 노무비집계 시트 — 회사별 총액(총 지급 노무비)을 각 회사 시트의 합계행에서 그대로 참조
  const [sy, sm] = month ? month.split("-") : ["", ""];
  const summaryRows: any[][] = [
    ["", month ? `${sy}년 ${Number(sm)}월 일용노무비 집계` : "일용노무비 집계"],
    [],
    ["", "업  체  명", "노  무  비"],
  ];
  companyTotalRows.forEach(() => summaryRows.push(["", "", ""]));
  summaryRows.push(["", "합  계", 0]);
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  companyTotalRows.forEach((c, i) => {
    wsSummary[addr(3 + i, 1)] = { t: "str", v: `${c.company}㈜` };
    wsSummary[addr(3 + i, 2)] = { t: "n", f: `'${c.sheetName}'!${addr(c.totalRow, TOTAL_COL)}` };
  });
  const sumFirst = addr(3, 2);
  const sumLast = addr(3 + companyTotalRows.length - 1, 2);
  wsSummary[addr(3 + companyTotalRows.length, 2)] = { t: "n", f: `SUM(${sumFirst}:${sumLast})` };
  wsSummary["!merges"] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "노무비집계");

  // 사원명부 시트 — 임금대장의 VLOOKUP이 참조하는 원본 인원 명부
  const wsRoster = XLSX.utils.aoa_to_sheet([
    ["", "", ""],
    ["", "성명", "주민등록번호", "은행", "계좌번호", "연락처"],
    ...workers.map((w) => ["", w.name, w.idFront, w.bankName, w.account, w.phone]),
  ]);
  XLSX.utils.book_append_sheet(wb, wsRoster, "사원명부");

  // 시트 순서를 노무비집계가 맨 앞에 오도록 재배치
  wb.SheetNames = ["노무비집계", ...companyTotalRows.map((c) => c.sheetName), "사원명부"];

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toISOString().slice(0, 10);
  const label = month || "전체기간";
  const filename = encodeURIComponent(`일용임금대장_${label}_${today}.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
