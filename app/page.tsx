"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { COMPANIES, Project, todayStr } from "@/lib/erp";
import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import ProjectSheet from "@/components/ProjectSheet";
import { useAuth } from "@/components/AuthProvider";

type SheetState = { mode: "add" } | { mode: "edit"; projectId: string } | null;

export default function HomePage() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(COMPANIES[0]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [reportMonth, setReportMonth] = useState(todayStr().slice(0, 7));
  const [showCompleted, setShowCompleted] = useState(false);
  const [laborScope, setLaborScope] = useState<"all" | "company" | "project">("all");
  const [laborCompany, setLaborCompany] = useState(COMPANIES[0]);
  const [laborProjectId, setLaborProjectId] = useState("");
  const [monthlyMonth, setMonthlyMonth] = useState(todayStr().slice(0, 7));
  const [monthlyScope, setMonthlyScope] = useState<"all" | "company" | "project">("all");
  const [monthlyCompany, setMonthlyCompany] = useState(COMPANIES[0]);
  const [monthlyProjectId, setMonthlyProjectId] = useState("");
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handleChangePassword() {
    setPwError("");
    if (!/^\d{4}$/.test(pwCurrent)) {
      setPwError("현재 비밀번호를 입력해주세요.");
      return;
    }
    if (!/^\d{4}$/.test(pwNew)) {
      setPwError("새 비밀번호는 숫자 4자리예요.");
      return;
    }
    if (pwNew !== pwNew2) {
      setPwError("새 비밀번호가 서로 달라요.");
      return;
    }
    setPwBusy(true);
    try {
      await api.changePassword(user.id, pwCurrent, pwNew);
      setPwSuccess(true);
      setPwCurrent("");
      setPwNew("");
      setPwNew2("");
      setTimeout(() => {
        setPwSuccess(false);
        setShowPwForm(false);
      }, 1500);
    } catch (e: any) {
      setPwError(e.message || "변경 중 오류가 발생했어요.");
    } finally {
      setPwBusy(false);
    }
  }

  useEffect(() => {
    // 서버가 로그인 사용자 권한에 따라 담당 현장만 내려줍니다 (관리자는 전체).
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

  const allProjectsSorted = useMemo(
    () => [...projects].sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)),
    [projects]
  );

  const allCompaniesLabel = COMPANIES.join("+");

  const laborReportHref = useMemo(() => {
    const params = new URLSearchParams({ month: reportMonth, uid: user.id });
    if (laborScope === "company") {
      params.set("scope", "company");
      params.set("company", laborCompany);
    } else if (laborScope === "project" && laborProjectId) {
      params.set("scope", "project");
      params.set("projectId", laborProjectId);
    }
    return `/api/export/labor-report?${params.toString()}`;
  }, [reportMonth, laborScope, laborCompany, laborProjectId, user.id]);

  const laborReportLabel =
    laborScope === "company"
      ? `🧾 노무비 신고용 집계 (${laborCompany})`
      : laborScope === "project"
      ? `🧾 노무비 신고용 집계 (${allProjectsSorted.find((p) => p.id === laborProjectId)?.name || "현장 선택"})`
      : `🧾 노무비 신고용 집계 (${allCompaniesLabel} 합산)`;

  const monthlyReportHref = useMemo(() => {
    const params = new URLSearchParams({ month: monthlyMonth, uid: user.id });
    if (monthlyScope === "company") {
      params.set("scope", "company");
      params.set("company", monthlyCompany);
    } else if (monthlyScope === "project" && monthlyProjectId) {
      params.set("scope", "project");
      params.set("projectId", monthlyProjectId);
    }
    return `/api/export/monthly?${params.toString()}`;
  }, [monthlyMonth, monthlyScope, monthlyCompany, monthlyProjectId, user.id]);

  const monthlyReportLabel =
    monthlyScope === "company"
      ? `📊 장비·자재 집계 (${monthlyCompany})`
      : monthlyScope === "project"
      ? `📊 장비·자재 집계 (${allProjectsSorted.find((p) => p.id === monthlyProjectId)?.name || "현장 선택"})`
      : `📊 장비·자재 집계 (${allCompaniesLabel} 합산)`;

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 0 10px 0",
            fontSize: 12,
            color: "#8fb9c9",
          }}
        >
          <span>
            {user.name} 님 · {user.isAdmin ? "관리자" : "현장 담당"}
          </span>
          <span style={{ display: "flex", gap: 10 }}>
            {user.isAdmin && (
              <Link href="/users" style={{ color: "#8fb9c9", textDecoration: "underline" }}>
                사용자·권한 관리
              </Link>
            )}
            <span
              onClick={() => {
                setShowPwForm((v) => !v);
                setPwError("");
                setPwSuccess(false);
              }}
              style={{ cursor: "pointer", textDecoration: "underline" }}
            >
              비밀번호 변경
            </span>
            <span
              onClick={logout}
              style={{ cursor: "pointer", textDecoration: "underline" }}
            >
              로그아웃
            </span>
          </span>
        </div>
        {showPwForm && (
          <div
            style={{
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
              비밀번호 변경
            </div>
            {pwError && (
              <div className="login-error" style={{ marginBottom: 8 }}>
                {pwError}
              </div>
            )}
            {pwSuccess ? (
              <div style={{ fontSize: 13, color: "var(--sinjin)" }}>✓ 비밀번호가 변경됐어요.</div>
            ) : (
              <>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="현재 비밀번호 (4자리)"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ width: "100%", padding: "8px 10px", marginBottom: 6, fontSize: 14 }}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="새 비밀번호 (4자리)"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ width: "100%", padding: "8px 10px", marginBottom: 6, fontSize: 14 }}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="새 비밀번호 확인"
                  value={pwNew2}
                  onChange={(e) => setPwNew2(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{ width: "100%", padding: "8px 10px", marginBottom: 8, fontSize: 14 }}
                />
                <button className="btn-primary" onClick={handleChangePassword} disabled={pwBusy} style={{ marginTop: 0 }}>
                  {pwBusy ? "변경 중..." : "변경하기"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <>
          <div style={{ padding: "10px 16px 0 16px", display: "flex", gap: 6 }}>
            <input
              type="month"
              value={monthlyMonth}
              onChange={(e) => setMonthlyMonth(e.target.value)}
              style={{
                flex: "0 0 110px",
                padding: "0 8px",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                background: "#fff",
                color: "var(--ink)",
              }}
            />
            <select
              value={monthlyScope}
              onChange={(e) => {
                const v = e.target.value as "all" | "company" | "project";
                setMonthlyScope(v);
                if (v === "project" && !monthlyProjectId && allProjectsSorted.length > 0) {
                  setMonthlyProjectId(allProjectsSorted[0].id);
                }
              }}
              style={{
                flex: 1,
                padding: "0 8px",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                background: "#fff",
                color: "var(--ink)",
              }}
            >
              <option value="all">전체집계 ({allCompaniesLabel})</option>
              <option value="company">회사별 집계</option>
              <option value="project">현장별 집계</option>
            </select>
          </div>

          {monthlyScope === "company" && (
            <div style={{ padding: "8px 16px 0 16px" }}>
              <select
                value={monthlyCompany}
                onChange={(e) => setMonthlyCompany(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "#fff",
                  color: "var(--ink)",
                }}
              >
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {monthlyScope === "project" && (
            <div style={{ padding: "8px 16px 0 16px" }}>
              <select
                value={monthlyProjectId}
                onChange={(e) => setMonthlyProjectId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "#fff",
                  color: "var(--ink)",
                }}
              >
                {allProjectsSorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.company}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ padding: "8px 16px 0 16px" }}>
            <a
              className="export-btn"
              style={{ padding: 10, display: "block", textAlign: "center", textDecoration: "none" }}
              href={monthlyReportHref}
            >
              {monthlyReportLabel}
            </a>
          </div>

          <div style={{ padding: "8px 16px 0 16px", display: "flex", gap: 6 }}>
            <input
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              style={{
                flex: "0 0 110px",
                padding: "0 8px",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                background: "#fff",
                color: "var(--ink)",
              }}
            />
            <select
              value={laborScope}
              onChange={(e) => {
                const v = e.target.value as "all" | "company" | "project";
                setLaborScope(v);
                if (v === "project" && !laborProjectId && allProjectsSorted.length > 0) {
                  setLaborProjectId(allProjectsSorted[0].id);
                }
              }}
              style={{
                flex: 1,
                padding: "0 8px",
                border: "1px solid var(--line)",
                borderRadius: 6,
                fontSize: 13,
                background: "#fff",
                color: "var(--ink)",
              }}
            >
              <option value="all">전체집계 ({allCompaniesLabel})</option>
              <option value="company">회사별 집계</option>
              <option value="project">현장별 집계</option>
            </select>
          </div>

          {laborScope === "company" && (
            <div style={{ padding: "8px 16px 0 16px" }}>
              <select
                value={laborCompany}
                onChange={(e) => setLaborCompany(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "#fff",
                  color: "var(--ink)",
                }}
              >
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {laborScope === "project" && (
            <div style={{ padding: "8px 16px 0 16px" }}>
              <select
                value={laborProjectId}
                onChange={(e) => setLaborProjectId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "#fff",
                  color: "var(--ink)",
                }}
              >
                {allProjectsSorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.company}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ padding: "8px 16px 0 16px" }}>
            <a
              className="export-btn"
              style={{
                padding: 10,
                display: "block",
                textAlign: "center",
                textDecoration: "none",
              }}
              href={laborReportHref}
            >
              {laborReportLabel}
            </a>
          </div>
      </>

      {user.isAdmin && (
        <>
          <div style={{ padding: "8px 16px 0 16px" }}>
            <Link
              href="/workers"
              className="export-btn"
              style={{ width: "100%", padding: 10, display: "block", textAlign: "center", textDecoration: "none" }}
            >
              👤 인원 명부 관리 (주민번호·계좌)
            </Link>
          </div>

          <div style={{ padding: "8px 16px 0 16px" }}>
            <Link
              href="/users"
              className="export-btn"
              style={{ width: "100%", padding: 10, display: "block", textAlign: "center", textDecoration: "none" }}
            >
              👥 사용자·권한 관리
            </Link>
          </div>
        </>
      )}

      <div className="section-label">
        <span>진행 중인 공사</span>
        <span>{dashTotal}건</span>
      </div>

      <div className="list">
        {sortedList.length === 0 ? (
          <div className="empty">
            {user.isAdmin ? (
              <>
                등록된 공사가 없어요.
                <br />
                아래 &apos;+ 공사 등록&apos; 버튼으로 추가해 보세요.
              </>
            ) : (
              <>
                배정된 현장이 없어요.
                <br />
                관리자에게 담당 현장 배정을 요청하세요.
              </>
            )}
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

      {user.isAdmin && (
        <div className="fab">
          <button onClick={() => setSheet({ mode: "add" })}>+ 공사 등록</button>
        </div>
      )}

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
