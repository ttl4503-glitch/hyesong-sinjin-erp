"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { COMPANIES, Project, todayStr } from "@/lib/erp";
import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import ProjectSheet from "@/components/ProjectSheet";

type SheetState = { mode: "add" } | { mode: "edit"; projectId: string } | null;

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(COMPANIES[0]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [reportMonth, setReportMonth] = useState(todayStr().slice(0, 7));
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const companyProjects = useMemo(
    () => projects.filter((p) => p.company === company),
    [projects, company]
  );

  const ongoingProjects = useMemo(
    () => companyProjects.filter((p) => !p.completed),
    [companyProjects]
  );
  const completedProjects = useMemo(
    () => companyProjects.filter((p) => p.completed),
    [companyProjects]
  );

  const sortedList = useMemo(
    () =>
      [...ongoingProjects].sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999")),
    [ongoingProjects]
  );
  const sortedCompletedList = useMemo(
    () =>
      [...completedProjects].sort((a, b) => (b.endDate || "").localeCompare(a.endDate || "")),
    [completedProjects]
  );

  const dashTotal = ongoingProjects.length;

  function updateProjectInList(updated: Project) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function addProjectToList(created: Project) {
    setProjects((prev) => [created, ...prev]);
    setCompany(created.company);
  }

  function removeProjectFromList(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  const editingProject =
    sheet?.mode === "edit" ? projects.find((p) => p.id === sheet.projectId) || null : null;

  if (loading) {
    return (
      <div className="app">
        <div className="loading">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          혜송·신진 <span>공사현황관리</span>
        </h1>
        <div className="tabs">
          {COMPANIES.map((c) => (
            <div
              key={c}
              className={`tab ${company === c ? "active" : ""}`}
              data-c={c}
              onClick={() => setCompany(c)}
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#8fb9c9", padding: "6px 0 10px 0" }}>
          ⚠️ 이 화면을 여는 모든 사람이 같은 데이터를 함께 보고 수정해요
        </div>
      </div>

      <div style={{ padding: "10px 16px 0 16px" }}>
        <a
          className="export-btn"
          style={{ width: "100%", padding: 10, display: "block", textAlign: "center", textDecoration: "none" }}
          href={`/api/export/monthly?company=${encodeURIComponent(company)}`}
        >
          📊 월별 집계 엑셀 다운로드 (인력·장비·자재·식대)
        </a>
      </div>

      <div style={{ padding: "8px 16px 0 16px", display: "flex", gap: 6 }}>
        <input
          type="month"
          value={reportMonth}
          onChange={(e) => setReportMonth(e.target.value)}
          style={{
            flex: "0 0 130px",
            padding: "0 8px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            fontSize: 12,
            background: "#fff",
            color: "var(--ink)",
          }}
        />
        <a
          className="export-btn"
          style={{
            flex: 1,
            padding: 10,
            display: "block",
            textAlign: "center",
            textDecoration: "none",
          }}
          href={`/api/export/labor-report?month=${reportMonth}`}
        >
          🧾 노무비 신고용 집계 (혜송+신진 합산)
        </a>
      </div>

      <div style={{ padding: "8px 16px 0 16px" }}>
        <Link
          href="/workers"
          className="export-btn"
          style={{ width: "100%", padding: 10, display: "block", textAlign: "center", textDecoration: "none" }}
        >
          👤 인원 명부 관리 (주민번호·계좌)
        </Link>
      </div>

      <div className="section-label">
        <span>진행 중인 공사</span>
        <span>{dashTotal}건</span>
      </div>

      <div className="list">
        {sortedList.length === 0 ? (
          <div className="empty">
            등록된 공사가 없어요.
            <br />
            아래 &apos;+ 공사 등록&apos; 버튼으로 추가해 보세요.
          </div>
        ) : (
          sortedList.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => setSheet({ mode: "edit", projectId: p.id })}
            />
          ))
        )}
      </div>

      <div
        className="section-label"
        style={{ cursor: "pointer" }}
        onClick={() => setShowCompleted((v) => !v)}
      >
        <span>✅ 완료된 공사 {showCompleted ? "▾" : "▸"}</span>
        <span>{sortedCompletedList.length}건</span>
      </div>

      {showCompleted && (
        <div className="list">
          {sortedCompletedList.length === 0 ? (
            <div className="empty">완료된 공사가 없어요.</div>
          ) : (
            sortedCompletedList.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => setSheet({ mode: "edit", projectId: p.id })}
              />
            ))
          )}
        </div>
      )}

      <div className="fab">
        <button onClick={() => setSheet({ mode: "add" })}>+ 공사 등록</button>
      </div>

      {sheet && (
        <ProjectSheet
          key={sheet.mode === "edit" ? sheet.projectId : "new"}
          mode={sheet.mode}
          project={editingProject}
          allProjects={projects}
          defaultCompany={company}
          onClose={() => setSheet(null)}
          onCreated={addProjectToList}
          onProjectUpdated={updateProjectInList}
          onDeleted={removeProjectFromList}
        />
      )}
    </div>
  );
}
