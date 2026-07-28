"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, TrashData, TrashType } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { formatWon } from "@/lib/erp";

const EMPTY: TrashData = { projects: [], workers: [], users: [], laborLogs: [] };

function fmtWhen(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TrashPage() {
  const { user } = useAuth();
  const [data, setData] = useState<TrashData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string>("");

  useEffect(() => {
    if (!user.isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [user.isAdmin]);

  function load() {
    setLoading(true);
    api
      .listTrash()
      .then(setData)
      .catch((e) => setError(e.message || "불러오기에 실패했어요."))
      .finally(() => setLoading(false));
  }

  async function restore(type: TrashType, id: string) {
    setBusyId(id);
    try {
      await api.restoreTrashItem(type, id);
      load();
    } catch (e: any) {
      alert(e.message || "복구에 실패했어요.");
    } finally {
      setBusyId("");
    }
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
            🗑 <span>휴지통</span>
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

  const total = data.projects.length + data.workers.length + data.users.length + data.laborLogs.length;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "12px 14px",
    marginBottom: 8,
  };

  const restoreBtn = (type: TrashType, id: string) => (
    <button
      className="btn-ghost"
      style={{ marginTop: 0, flexShrink: 0 }}
      disabled={busyId === id}
      onClick={() => restore(type, id)}
    >
      {busyId === id ? "복구 중..." : "복구"}
    </button>
  );

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          🗑 <span>휴지통</span>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <Link href="/" className="back-link">
          ← 돌아가기
        </Link>
      </div>

      <div style={{ padding: "12px 16px 24px 16px" }}>
        {error && <div className="login-error">{error}</div>}
        <div style={{ fontSize: 12.5, color: "#8a8371", margin: "4px 0 16px" }}>
          삭제된 항목이 여기 모여요. 필요하면 원래대로 복구할 수 있어요. (총 {total}건)
        </div>

        <div className="section-label">
          <span>🏗 삭제된 공사</span>
          <span>{data.projects.length}건</span>
        </div>
        {data.projects.length === 0 ? (
          <div className="empty">삭제된 공사가 없어요.</div>
        ) : (
          data.projects.map((p) => (
            <div key={p.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  [{p.company}] {p.name}
                </div>
                <div style={{ fontSize: 12, color: "#8a8371", marginTop: 2 }}>
                  {p.location || "위치 미입력"} · 삭제 {fmtWhen(p.deletedAt)}
                </div>
              </div>
              {restoreBtn("project", p.id)}
            </div>
          ))
        )}

        <div className="section-label" style={{ marginTop: 20 }}>
          <span>👤 삭제된 인원</span>
          <span>{data.workers.length}건</span>
        </div>
        {data.workers.length === 0 ? (
          <div className="empty">삭제된 인원이 없어요.</div>
        ) : (
          data.workers.map((w) => (
            <div key={w.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{w.name || "(이름 미입력)"}</div>
                <div style={{ fontSize: 12, color: "#8a8371", marginTop: 2 }}>
                  {w.jobType || "직종 미입력"} · 삭제 {fmtWhen(w.deletedAt)}
                </div>
              </div>
              {restoreBtn("worker", w.id)}
            </div>
          ))
        )}

        <div className="section-label" style={{ marginTop: 20 }}>
          <span>👥 삭제된 사용자</span>
          <span>{data.users.length}건</span>
        </div>
        {data.users.length === 0 ? (
          <div className="empty">삭제된 사용자가 없어요.</div>
        ) : (
          data.users.map((u) => (
            <div key={u.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {u.name} {u.isAdmin && <span style={{ color: "#8a8371", fontWeight: 400 }}>(관리자)</span>}
                </div>
                <div style={{ fontSize: 12, color: "#8a8371", marginTop: 2 }}>삭제 {fmtWhen(u.deletedAt)}</div>
              </div>
              {restoreBtn("user", u.id)}
            </div>
          ))
        )}

        <div className="section-label" style={{ marginTop: 20 }}>
          <span>📋 삭제된 작업일보 항목</span>
          <span>{data.laborLogs.length}건</span>
        </div>
        {data.laborLogs.length === 0 ? (
          <div className="empty">삭제된 작업일보 항목이 없어요.</div>
        ) : (
          data.laborLogs.map((l) => (
            <div key={l.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  [{l.company}/{l.projectName}] {l.type} · {l.name}
                </div>
                <div style={{ fontSize: 12, color: "#8a8371", marginTop: 2 }}>
                  {l.date} · {formatWon(l.amount)}원 · 삭제 {fmtWhen(l.deletedAt)}
                </div>
              </div>
              {restoreBtn("laborlog", l.id)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
