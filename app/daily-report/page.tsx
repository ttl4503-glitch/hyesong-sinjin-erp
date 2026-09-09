"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { Project, LaborLog, formatWon, fmtDate, todayStr } from "@/lib/erp";

const TYPE_CLASS: Record<string, string> = {
  인력: "person",
  장비: "equip",
  자재: "material",
  식대: "meal",
  참: "snack",
  운반비: "freight",
  잡자재: "misc",
};
const TYPES_ORDER = ["인력", "장비", "자재", "식대", "참", "운반비", "잡자재"];

interface ProjectDayEntry {
  projectId: string;
  company: string;
  projectName: string;
  logs: LaborLog[];
  amount: number;
}

export default function DailyReportPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user.isAdmin) {
      setLoading(false);
      return;
    }
    api
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, [user.isAdmin]);

  const byDate = useMemo(() => {
    const map = new Map<string, Map<string, ProjectDayEntry>>();
    projects.forEach((p) => {
      p.laborLogs.forEach((l) => {
        const date = l.date || "";
        if (!date.startsWith(month)) return;
        if (!map.has(date)) map.set(date, new Map());
        const dayMap = map.get(date)!;
        if (!dayMap.has(p.id)) {
          dayMap.set(p.id, { projectId: p.id, company: p.company, projectName: p.name, logs: [], amount: 0 });
        }
        const entry = dayMap.get(p.id)!;
        entry.logs.push(l);
        entry.amount += Number(l.amount) || 0;
      });
    });
    return Array.from(map.entries())
      .map(([date, projMap]) => {
        const list = Array.from(projMap.values()).sort(
          (a, b) => a.company.localeCompare(b.company) || a.projectName.localeCompare(b.projectName)
        );
        return { date, projects: list, amount: list.reduce((s, e) => s + e.amount, 0) };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [projects, month]);

  function toggleDate(d: string) {
    setOpenDates((prev) => ({ ...prev, [d]: !prev[d] }));
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">불러오는 중...</div>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="app">
        <div className="topbar">
          <h1>
            날짜별 <span>작업일보 모아보기</span>
          </h1>
        </div>
        <div style={{ padding: "16px" }}>
          <div className="login-error">관리자만 접근할 수 있는 화면이에요.</div>
          <div style={{ marginTop: 12 }}>
            <Link href="/" className="back-link">
              ← 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          날짜별 <span>작업일보 모아보기</span>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <Link href="/" className="back-link">
          ← 돌아가기
        </Link>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8371", margin: "0 0 14px" }}>
          이 달에 실제로 투입 기록이 있는 날짜만 폴더로 모아서 보여드려요. 날짜를 눌러 펼치면 그날 투입된 현장 목록이 나와요.
        </div>

        {byDate.length === 0 ? (
          <div className="empty">이 달에는 투입 기록이 없어요.</div>
        ) : (
          byDate.map((d) => {
            const isOpen = !!openDates[d.date];
            return (
              <div className="lg-group" key={d.date}>
                <div className="lg-group-header" onClick={() => toggleDate(d.date)}>
                  <span style={{ fontSize: 15 }}>{isOpen ? "📂" : "📁"}</span>
                  <div className="lg-group-meta" style={{ flex: "none", fontWeight: 700, color: "var(--ink)" }}>
                    {fmtDate(d.date)}
                  </div>
                  <div className="lg-group-meta">
                    {d.projects.length}개 현장 · {formatWon(d.amount)}원
                  </div>
                  <div className={`chevron ${isOpen ? "open" : ""}`}>▸</div>
                </div>
                {isOpen && (
                  <div className="lg-group-body">
                    {d.projects.map((pe) => {
                      const byType = TYPES_ORDER.map((type) => ({
                        type,
                        logs: pe.logs.filter((l) => l.type === type),
                      })).filter((g) => g.logs.length > 0);
                      return (
                        <div key={pe.projectId} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                              [{pe.company}] {pe.projectName}
                            </div>
                            <a
                              href={`/print/${pe.projectId}/${encodeURIComponent(d.date)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="wi-upload-btn"
                              style={{ fontSize: 11, textDecoration: "none", flexShrink: 0 }}
                            >
                              🖨 인쇄
                            </a>
                          </div>
                          <div style={{ fontSize: 12, color: "#6b6455", marginTop: 2 }}>
                            {pe.logs.length}건 · {formatWon(pe.amount)}원
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                            {byType.map((g) => (
                              <span key={g.type} className={`lg-type ${TYPE_CLASS[g.type] || "misc"}`}>
                                {g.type} {g.logs.length}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
