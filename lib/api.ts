import type { Project, Worker } from "@/lib/erp";
import type { ParsedWorkItem } from "@/lib/parseWorkItems";

export interface WorkItemsParseResult {
  items: ParsedWorkItem[];
  total: number;
  fileName: string;
}

export interface ManagedUser {
  id: string;
  name: string;
  pin: string;
  isAdmin: boolean;
  projectIds: string[];
}

// 현재 로그인한 사용자 id (localStorage) — 서버 권한 확인용 헤더에 실어 보냅니다.
function currentUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    return JSON.parse(localStorage.getItem("erp_user") || "{}").id || "";
  } catch {
    return "";
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const id = currentUserId();
  return id ? { ...extra, "x-user-id": id } : { ...extra };
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "요청 처리 중 오류가 발생했어요.");
  }
  return res.json();
}

const jsonHeaders = () => authHeaders({ "Content-Type": "application/json" });

export const api = {
  listProjects: (): Promise<Project[]> =>
    fetch("/api/projects", { headers: authHeaders() }).then(handle),

  createProject: (data: Partial<Project>): Promise<Project> =>
    fetch("/api/projects", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  updateProject: (id: string, data: Partial<Project>): Promise<Project> =>
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  deleteProject: (id: string): Promise<{ ok: true }> =>
    fetch(`/api/projects/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  addMilestone: (projectId: string, title: string, date: string) =>
    fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ title, date }),
    }).then(handle),

  toggleMilestone: (projectId: string, msId: string, done: boolean) =>
    fetch(`/api/projects/${projectId}/milestones/${msId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ done }),
    }).then(handle),

  deleteMilestone: (projectId: string, msId: string) =>
    fetch(`/api/projects/${projectId}/milestones/${msId}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  addLaborLog: (projectId: string, data: Record<string, unknown>) =>
    fetch(`/api/projects/${projectId}/laborlogs`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  updateLaborLog: (projectId: string, logId: string, data: Record<string, unknown>) =>
    fetch(`/api/projects/${projectId}/laborlogs/${logId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  deleteLaborLog: (projectId: string, logId: string) =>
    fetch(`/api/projects/${projectId}/laborlogs/${logId}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  bulkAddLaborLogs: (projectId: string, entries: Record<string, unknown>[]) =>
    fetch(`/api/projects/${projectId}/laborlogs/bulk`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ entries }),
    }).then(handle),

  upsertDailyNote: (projectId: string, date: string, content: string) =>
    fetch(`/api/projects/${projectId}/dailynotes`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ date, content }),
    }).then(handle),

  parseWorkItems: (projectId: string, file: File): Promise<WorkItemsParseResult> => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/projects/${projectId}/workitems/parse`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    }).then(handle);
  },

  commitWorkItems: (
    projectId: string,
    payload: { items: ParsedWorkItem[]; fileName: string }
  ): Promise<Project> =>
    fetch(`/api/projects/${projectId}/workitems/commit`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    }).then(handle),

  listWorkers: (): Promise<Worker[]> => fetch("/api/workers", { headers: authHeaders() }).then(handle),

  createWorker: (data: Partial<Worker>): Promise<Worker> =>
    fetch("/api/workers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  updateWorker: (id: string, data: Partial<Worker>): Promise<Worker> =>
    fetch(`/api/workers/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  deleteWorker: (id: string): Promise<{ ok: true }> =>
    fetch(`/api/workers/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  uploadReceipt: (logId: string, imageData: string): Promise<{ id: string }> =>
    fetch(`/api/laborlogs/${logId}/receipt`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ imageData }),
    }).then(handle),

  getReceipt: (logId: string): Promise<{ imageData: string }> =>
    fetch(`/api/laborlogs/${logId}/receipt`, { headers: authHeaders() }).then(handle),

  deleteReceipt: (logId: string): Promise<{ ok: true }> =>
    fetch(`/api/laborlogs/${logId}/receipt`, { method: "DELETE", headers: authHeaders() }).then(handle),

  // ===== 사용자·권한 관리 (관리자 전용) =====
  listUsers: (): Promise<ManagedUser[]> => fetch("/api/users", { headers: authHeaders() }).then(handle),

  createUser: (data: { name: string; pin: string; isAdmin: boolean; projectIds: string[] }): Promise<ManagedUser> =>
    fetch("/api/users", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  updateUser: (id: string, data: Partial<{ name: string; pin: string; isAdmin: boolean; projectIds: string[] }>): Promise<ManagedUser> =>
    fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }).then(handle),

  deleteUser: (id: string): Promise<{ ok: true }> =>
    fetch(`/api/users/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle),

  // 오래된 출역 셀카 정리 (기본 90일 지난 것) — 출역·공수 기록은 유지
  cleanupCheckinPhotos: (days = 90): Promise<{ deleted: number; days: number }> =>
    fetch(`/api/checkin/cleanup?days=${days}`, { headers: authHeaders() }).then(handle),

  // ===== 휴지통 (관리자 전용) =====
  listTrash: (): Promise<TrashData> => fetch("/api/trash", { headers: authHeaders() }).then(handle),

  restoreTrashItem: (type: TrashType, id: string): Promise<{ ok: true }> =>
    fetch("/api/trash", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ type, id }),
    }).then(handle),
};

export type TrashType = "project" | "worker" | "user" | "laborlog" | "receipt";

export interface TrashData {
  projects: { id: string; company: string; name: string; location: string; deletedAt: string }[];
  workers: { id: string; name: string; jobType: string; idFront: string; deletedAt: string }[];
  users: { id: string; name: string; isAdmin: boolean; deletedAt: string }[];
  laborLogs: {
    id: string;
    projectId: string;
    projectName: string;
    company: string;
    type: string;
    name: string;
    date: string;
    amount: number;
    deletedAt: string;
  }[];
  receipts: {
    id: string;
    laborLogId: string;
    projectName: string;
    company: string;
    type: string;
    name: string;
    date: string;
    imageData: string;
    deletedAt: string;
  }[];
}
