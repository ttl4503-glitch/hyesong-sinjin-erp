"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Worker } from "@/lib/erp";

const ID_FRONT_RE = /\b(\d{6})[-\s]?\d{0,7}\b/;
const ACCOUNT_RE = /\b(\d[\d-\s]{8,20}\d)\b/;

function emptyForm() {
  return { name: "", jobType: "", idFront: "", bankName: "", account: "" };
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .listWorkers()
      .then(setWorkers)
      .finally(() => setLoading(false));
  }, []);

  function startEdit(w: Worker) {
    setEditingId(w.id);
    setForm({ name: w.name, jobType: w.jobType, idFront: w.idFront, bankName: w.bankName, account: w.account });
    setOcrText("");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setOcrText("");
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (editingId) {
        const updated = await api.updateWorker(editingId, form);
        setWorkers((prev) => prev.map((w) => (w.id === editingId ? updated : w)));
      } else {
        const created = await api.createWorker(form);
        setWorkers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      cancelEdit();
    } catch (e: any) {
      setError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 인원을 삭제할까요?")) return;
    await api.deleteWorker(id);
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    if (editingId === id) cancelEdit();
  }

  async function handlePhoto(file: File) {
    setOcrBusy(true);
    setOcrText("");
    setError("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("kor+eng");
      const {
        data: { text },
      } = await worker.recognize(file);
      await worker.terminate();
      setOcrText(text);

      const idMatch = text.match(ID_FRONT_RE);
      const accountMatch = text.match(ACCOUNT_RE);
      setForm((f) => ({
        ...f,
        idFront: idMatch ? idMatch[1] : f.idFront,
        account: accountMatch ? accountMatch[1].replace(/[\s-]/g, "") : f.account,
      }));
    } catch (e: any) {
      setError("사진 인식에 실패했어요. 직접 입력해주세요.");
    } finally {
      setOcrBusy(false);
    }
  }

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
          인원 명부 <span>주민번호·계좌 관리</span>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <Link href="/" className="back-link">
          ← 돌아가기
        </Link>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <div className="login-error" style={{ background: "#f3e0d6", marginBottom: 12 }}>
          ⚠️ 주민번호·계좌번호는 민감한 개인정보예요. 이 화면 링크를 필요한 사람에게만 공유해주세요.
        </div>
      </div>

      <div className="wi-box" style={{ margin: "0 16px 16px 16px" }}>
        <div className="wi-summary">{editingId ? "인원 정보 수정" : "새 인원 등록"}</div>
        {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="row2" style={{ marginTop: 10 }}>
          <div className="field">
            <label>이름</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>직종</label>
            <input value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>주민번호 앞자리 (6자리)</label>
            <input
              value={form.idFront}
              maxLength={6}
              onChange={(e) => setForm({ ...form, idFront: e.target.value })}
            />
          </div>
          <div className="field">
            <label>은행명</label>
            <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>계좌번호</label>
          <input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
        </div>

        <button
          className="wi-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={ocrBusy}
        >
          📷 {ocrBusy ? "사진 인식 중..." : "사진으로 인식해서 채우기"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePhoto(f);
            e.target.value = "";
          }}
        />
        {ocrText && (
          <div style={{ marginTop: 8 }}>
            <div className="progress-auto-sub" style={{ textAlign: "left" }}>
              인식된 글자 (참고용 — 위 칸에 정확한 값으로 직접 수정해주세요)
            </div>
            <textarea readOnly value={ocrText} style={{ minHeight: 60, fontSize: 11, marginTop: 4 }} />
          </div>
        )}

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : editingId ? "수정 저장" : "등록"}
        </button>
        {editingId && (
          <button className="btn-ghost" onClick={cancelEdit}>
            취소
          </button>
        )}
      </div>

      <div className="section-label">
        <span>등록된 인원</span>
        <span>{workers.length}명</span>
      </div>

      <div className="list" style={{ paddingBottom: 40 }}>
        {workers.length === 0 && <div className="empty">등록된 인원이 없어요.</div>}
        {workers.map((w) => (
          <div className="user-row" key={w.id}>
            <div>
              <div className="uname">
                {w.name} {w.jobType && <span style={{ color: "#8a8371", fontWeight: 400 }}>· {w.jobType}</span>}
              </div>
              <div className="uemail">
                {w.idFront ? `${w.idFront}-●●●●●●●` : "주민번호 미등록"} · {w.bankName} {w.account}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="lg-edit" onClick={() => startEdit(w)}>
                ✎
              </div>
              <div className="lg-del" onClick={() => handleDelete(w.id)}>
                ✕
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
