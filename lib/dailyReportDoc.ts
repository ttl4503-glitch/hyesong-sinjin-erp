import { LaborLog, Project } from "@/lib/erp";

export interface ReportRow extends LaborLog {
  cumulative: number;
}

export interface DailyReportDoc {
  date: string;
  company: string;
  projectName: string;
  startDate: string;
  endDate: string;
  contractAmount: number;
  progressPct: number;
  workContent: string;
  cumLabor: number;
  cumEquip: number;
  cumMaterial: number;
  cumMeal: number;
  cumMisc: number;
  cumTotal: number;
  todayTotal: number;
  laborRows: ReportRow[];
  equipRows: ReportRow[];
  materialRows: ReportRow[];
  mealRows: ReportRow[];
}

// Builds the data for one day's 현장운영일보 (site operation daily report),
// matching the real paper template: today's entries per category, plus a
// running cumulative total per person/equipment/item up to and including
// this date.
export function buildDailyReportDoc(project: Project, date: string): DailyReportDoc {
  const allLogs = project.laborLogs;
  const upToDate = (l: LaborLog) => (l.date || "") <= date;
  const onDate = (l: LaborLog) => l.date === date;

  const sumType = (type: string, pred: (l: LaborLog) => boolean) =>
    allLogs.filter((l) => l.type === type && pred(l)).reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const cumLabor = sumType("인력", upToDate);
  const cumEquip = sumType("장비", upToDate);
  const cumMaterial = sumType("자재", upToDate);
  const cumMeal = sumType("식대", upToDate);
  const cumMisc = sumType("잡자재", upToDate);
  const cumTotal = cumLabor + cumEquip + cumMaterial + cumMeal + cumMisc;

  const todayLogs = allLogs.filter(onDate);
  const todayTotal = todayLogs.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  function withCumulative(type: string): ReportRow[] {
    return todayLogs
      .filter((l) => l.type === type)
      .map((l) => {
        const cumulative = allLogs
          .filter((x) => x.type === type && x.name === l.name && upToDate(x))
          .reduce((s, x) => s + (Number(x.amount) || 0), 0);
        return { ...l, cumulative };
      });
  }

  const progressPct =
    project.contractAmount > 0 ? Math.round((cumTotal / project.contractAmount) * 100) : 0;

  return {
    date,
    company: project.company,
    projectName: project.name,
    startDate: project.startDate,
    endDate: project.endDate,
    contractAmount: project.contractAmount,
    progressPct,
    workContent: project.dailyNotes.find((n) => n.date === date)?.content || "",
    cumLabor,
    cumEquip,
    cumMaterial,
    cumMeal,
    cumMisc,
    cumTotal,
    todayTotal,
    laborRows: withCumulative("인력"),
    equipRows: withCumulative("장비"),
    materialRows: [...withCumulative("자재"), ...withCumulative("잡자재")],
    mealRows: withCumulative("식대"),
  };
}
