"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type ManagedUser } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import type { Project } from "@/lib/erp";

function emptyForm() {
  return { name: "", pin: "", isAdmin: false, projectIds: [] as string[] };
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user.isAdmin) {
      setLoading(false);
      return;
    }
    Promise.all([api.listUsers(), api.listProjects()])
      .then(([us, ps]) => {
        setUsers(us);
        setProjects(ps);
      })
      .catch((e) => setError(e.message || "불러오기에 실패했어요."))
      .finally(() => setLoading(false));
  }, [user.isAdmin]);

  const sortedProjects = useMemo(
    () =>
      projects
        .filter((p) => !p.completed)
        .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name)),
    [projects]
  );

  function projectName(id: string) {
    const p = projects.find((x) => x.id === id);
    return p ? p.name : "(삭제된 현장)";
  }

  function startEdit(u: ManagedUser) {
    setEditingId(u.id);
    setForm({ name: u.name, pin: u.pin, isAdmin: u.isAdmin, projectIds: [...u.projectIds] });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  }

  function toggleProject(id: string) {
    setForm((f) =>
      f.projectIds.includes(id)
        ? { ...f, projectIds: f.projectIds.filter((x) => x !== id) }
        : { ...f, projectIds: [...f.projectIds, id] }
    );
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!/^\d{4}$/.test(form.pin)) {
      setError("비밀번호는 숫자 4자리로 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (editingId) {
        const updated = await api.updateUser(editingId, form);
        setUsers((prev) => prev.map((u) => (u.id === editingId ? updated : u)));
      } else {
        const created = await api.createUser(form);
        setUsers((prev) => [...prev, created]);
      }
      cancelEdit();
    } catch (e: any) {
      setError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: ManagedUser) {
    if (u.id === user.id) {
      alert("본인 계정은 삭제할 수 없어요.");
      return;
    }
    if (!confirm(`'${u.name}' 사용자를 삭제할까요?`)) return;
    try {
      await api.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      if (editingId === u.id) cancelEdit();
    } catch (e: any) {
      alert(e.message || "삭제에 실패했어요.");
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
            사용자·권한 <span>관리</span>
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 15,
    background: "#fff",
    color: "var(--ink)",
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          사용자·권한 <span>관리</span>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <Link href="/" className="back-link">
          ← 돌아가기
        </Link>
      </div>

      <div className="wi-box" style={{ margin: "12px 16px 16px 16px" }}>
        <div className="wi-summary">{editingId ? "사용자 정보 수정" : "새 사용자 등록"}</div>
        {error && (
          <div className="login-error" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <div className="row2" style={{ marginTop: 10 }}>
          <div className="field">
            <label>이름</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>비밀번호 (숫자 4자리)</label>
            <input
              style={{ ...inputStyle, letterSpacing: 4 }}
              value={form.pin}
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/[^0-9]/g, "") })}
            />
          </div>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={form.isAdmin}
            onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
          관리자 (모든 현장 조회·수정 + 사용자 관리)
        </label>

        {!form.isAdmin && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12.5, color: "#8a8371", fontWeight: 600 }}>
              담당 현장 (체크한 현장만 보이고 입력·수정 가능)
            </label>
            <div
              style={{
                marginTop: 8,
                border: "1px solid var(--line)",
                borderRadius: 8,
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {sortedProjects.length === 0 && (
                <div style={{ padding: 12, color: "#8a8371", fontSize: 13 }}>
                  등록된 현장이 없어요.
                </div>
              )}
              {sortedProjects.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.projectIds.includes(p.id)}
                    onChange={() => toggleProject(p.id)}
                    style={{ width: 18, height: 18 }}
                  />
                  <span>
                    <span style={{ color: "#8a8371", fontSize: 12 }}>[{p.company}]</span> {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 14 }}>
          {saving ? "저장 중..." : editingId ? "수정 저장" : "등록"}
        </button>
        {editingId && (
          <button className="btn-ghost" onClick={cancelEdit}>
            취소
          </button>
        )}
      </div>

      <div className="section-label">
        <span>등록된 사용자</span>
        <span>{users.length}명</span>
      </div>

      <div className="list" style={{ paddingBottom: 40 }}>
        {users.length === 0 && <div className="empty">등록된 사용자가 없어요.</div>}
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <div>
              <div className="uname">
                {u.name}{" "}
                {u.isAdmin ? (
                  <span style={{ color: "#c0392b", fontWeight: 700, fontSize: 12 }}>· 관리자</span>
                ) : (
                  <span style={{ color: "#8a8371", fontWeight: 400, fontSize: 12 }}>· 현장 담당</span>
                )}
              </div>
              <div className="uemail">
                비번 {u.pin || "미설정"} ·{" "}
                {u.isAdmin
                  ? "전체 현장"
                  : u.projectIds.length === 0
                  ? "담당 현장 없음"
                  : `담당 ${u.projectIds.length}곳: ` +
                    u.projectIds.map(projectName).join(", ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="lg-edit" onClick={() => startEdit(u)}>
                ✎
              </div>
              <div className="lg-del" onClick={() => handleDelete(u)}>
                ✕
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
