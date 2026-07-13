import type { Project } from "@/lib/erp";
import type { ParsedWorkItem } from "@/lib/parseWorkItems";

export interface WorkItemsParseResult {
  items: ParsedWorkItem[];
  total: number;
  fileName: string;
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "요청 처리 중 오류가 발생했어요.");
  }
  return res.json();
}

export const api = {
  listProjects: (): Promise<Project[]> => fetch("/api/projects").then(handle),

  createProject: (data: Partial<Project>): Promise<Project> =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  updateProject: (id: string, data: Partial<Project>): Promise<Project> =>
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  deleteProject: (id: string): Promise<{ ok: true }> =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then(handle),

  addMilestone: (projectId: string, title: string, date: string) =>
    fetch(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, date }),
    }).then(handle),

  toggleMilestone: (projectId: string, msId: string, done: boolean) =>
    fetch(`/api/projects/${projectId}/milestones/${msId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }).then(handle),

  deleteMilestone: (projectId: string, msId: string) =>
    fetch(`/api/projects/${projectId}/milestones/${msId}`, { method: "DELETE" }).then(handle),

  addLaborLog: (projectId: string, data: Record<string, unknown>) =>
    fetch(`/api/projects/${projectId}/laborlogs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  updateLaborLog: (projectId: string, logId: string, data: Record<string, unknown>) =>
    fetch(`/api/projects/${projectId}/laborlogs/${logId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle),

  deleteLaborLog: (projectId: string, logId: string) =>
    fetch(`/api/projects/${projectId}/laborlogs/${logId}`, { method: "DELETE" }).then(handle),

  bulkAddLaborLogs: (projectId: string, entries: Record<string, unknown>[]) =>
    fetch(`/api/projects/${projectId}/laborlogs/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    }).then(handle),

  parseWorkItems: (projectId: string, file: File): Promise<WorkItemsParseResult> => {
    const formData = new FormData();
    formData.append("file", file);
    return fetch(`/api/projects/${projectId}/workitems/parse`, {
      method: "POST",
      body: formData,
    }).then(handle);
  },

  commitWorkItems: (
    projectId: string,
    payload: { items: ParsedWorkItem[]; fileName: string }
  ): Promise<Project> =>
    fetch(`/api/projects/${projectId}/workitems/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
};
