"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  COMPANIES,
  Project,
  computeProgress,
  daysUntil,
  formatWon,
  todayStr,
} from "@/lib/erp";
import ProjectCard from "@/components/ProjectCard";
import ProjectSheet from "@/components/ProjectSheet";

type SheetState = { mode: "add" } | { mode: "edit"; projectId: string } | null;

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(COMPANIES[0]);
  const [sheet, setSheet] = useState<SheetState>(null);

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

  const sortedList = useMemo(
    () =>
      [...companyProjects].sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999")),
    [companyProjects]
  );

  const dashTotal = companyProjects.length;
  const dashAvg = dashTotal
    ? Math.round(companyProjects.reduce((s, p) => s + computeProgress(p), 0) / dashTotal)
    : 0;
  const dashLate = companyProjects.filter((p) => {
    const d = daysUntil(p.endDate);
    return d !== null && d < 0 && computeProgress(p) < 100;
  }).length;

  const today = todayStr();
  let personCount = 0;
  let equipCount = 0;
  let costTotal = 0;
  companyProjects.forEach((p) => {
    p.laborLogs.forEach((l) => {
      if (l.date === today) {
        const q = Number(l.qty) || 0;
        if (l.type === "인력") personCount += q;
        else if (l.type === "장비") equipCount += q;
        costTotal += Number(l.amount) || 0;
      }
    });
  });

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

      <div className="dash">
        <div className="dcard">
          <div className="num">{dashTotal}</div>
          <div className="lbl">진행 공사</div>
        </div>
        <div className="dcard">
          <div className="num">{dashAvg}%</div>
          <div className="lbl">평균 공정률</div>
        </div>
        <div className="dcard">
          <div className="num" style={{ color: dashLate > 0 ? "var(--danger)" : "var(--ink)" }}>
            {dashLate}
          </div>
          <div className="lbl">기한 초과</div>
        </div>
      </div>

      <div className="today-strip">
        <span>오늘({today}) 전체 현장 투입</span>
        <span>
          <b>인력 {personCount}공수</b> · <b>장비 {equipCount}공수</b> · <b>비용 {formatWon(costTotal)}원</b>
        </span>
      </div>

      <div style={{ padding: "10px 16px 0 16px" }}>
        <a
          className="export-btn"
          style={{ width: "100%", padding: 10, display: "block", textAlign: "center", textDecoration: "none" }}
          href={`/api/export/monthly?company=${encodeURIComponent(company)}`}
        >
          📊 인력·장비 월별 집계 엑셀 다운로드
        </a>
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

      <div className="fab">
        <button onClick={() => setSheet({ mode: "add" })}>+ 공사 등록</button>
      </div>

      {sheet && (
        <ProjectSheet
          key={sheet.mode === "edit" ? sheet.projectId : "new"}
          mode={sheet.mode}
          project={editingProject}
          allProjects={projects}
          onClose={() => setSheet(null)}
          onCreated={addProjectToList}
          onProjectUpdated={updateProjectInList}
          onDeleted={removeProjectFromList}
        />
      )}
    </div>
  );
}
