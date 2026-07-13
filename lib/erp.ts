export const COMPANIES = ["혜송산업개발", "신진조경"];

export interface Milestone {
  id: string;
  title: string;
  date: string;
  done: boolean;
}

export interface WorkItem {
  id: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface LaborLog {
  id: string;
  type: string;
  jobType: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  date: string;
  note: string;
  taxInvoice: boolean;
  workItemId: string | null;
}

export interface DailyNote {
  id: string;
  date: string;
  content: string;
}

export interface Project {
  id: string;
  company: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  contractAmount: number;
  progress: number;
  memo: string;
  workItemsTotal: number;
  workItemsFileName: string | null;
  milestones: Milestone[];
  laborLogs: LaborLog[];
  workItems: WorkItem[];
  dailyNotes: DailyNote[];
}

export function formatWon(n: number | string | null | undefined): string {
  return Number(n || 0).toLocaleString("ko-KR");
}

export function todayStr(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function fmtDate(d?: string | null): string {
  return d || "-";
}

export function totalInvestedCost(p: Project): number {
  return (p.laborLogs || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

export function autoProgressEnabled(p: Project): boolean {
  return Number(p.contractAmount) > 0;
}

export function computeProgress(p: Project): number {
  if (!autoProgressEnabled(p)) return Number(p.progress) || 0;
  const invested = totalInvestedCost(p);
  const pct = Math.round((invested / Number(p.contractAmount)) * 100);
  // Intentionally not capped at 100 — a project that has spent more than its
  // contract amount should visibly show it (e.g. 118%), not silently hide it.
  return Math.max(0, pct);
}

export function getWorkItemProgress(p: Project, itemId: string) {
  const invested = (p.laborLogs || [])
    .filter((l) => l.workItemId === itemId)
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const item = (p.workItems || []).find((w) => w.id === itemId);
  const budget = item ? Number(item.amount) || 0 : 0;
  const pct = budget > 0 ? Math.round((invested / budget) * 100) : 0;
  return { invested, budget, pct };
}

export function getKnownNames(projects: Project[]) {
  const map = new Map<string, { type: string; rate: number }>();
  projects.forEach((pr) => {
    (pr.laborLogs || []).forEach((l) => {
      if (l.name) map.set(l.name, { type: l.type, rate: l.rate || 0 });
    });
  });
  return Array.from(map.entries()).map(([name, info]) => ({
    name,
    type: info.type,
    rate: info.rate,
  }));
}

export function getKnownJobTypes(projects: Project[]) {
  const set = new Set(["조경공", "보통인부", "잔디공"]);
  projects.forEach((pr) => {
    (pr.laborLogs || []).forEach((l) => {
      if (l.jobType) set.add(l.jobType);
    });
  });
  return Array.from(set);
}
