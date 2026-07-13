"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Worker } from "@/lib/erp";

const ID_FRONT_RE = /\b(\d{6})[-\s]?\d{0,7}\b/;
const ACCOUNT_RE = /\b(\d[\d-\s]{8,20}\d)\b/;

// Lines on a Korean ID card that are NOT the person's name — used to filter
// out boilerplate when guessing which line is the name.
const ID_CARD_NOISE = [
  "주민등록증",
  "운전면허증",
  "성명",
  "생년월일",
  "주소",
  "발급",
  "발급일",
  "행정안전부",
  "경찰청",
  "지문",
  "서명",
  "고유번호",
  "종류",
  "대한민국",
  "면허번호",
  "적성검사",
];

const KNOWN_BANKS = [
  "국민은행",
  "KB국민",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협",
  "NH농협",
  "기업은행",
  "IBK기업",
  "새마을금고",
  "우체국",
  "카카오뱅크",
  "토스뱅크",
  "SC제일",
  "씨티은행",
  "부산은행",
  "대구은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
  "신협",
  "수협",
];

function extractName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!/^[가-힣]{2,4}$/.test(line)) continue;
    if (ID_CARD_NOISE.some((n) => line.includes(n))) continue;
    return line;
  }
  return "";
}

function extractBankName(text: string): string {
  const found = KNOWN_BANKS.find((b) => text.includes(b));
  return found || "";
}

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
  const idFileInputRef = useRef<HTMLInputElement>(null);
  const bankFileInputRef = useRef<HTMLInputElement>(null);

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

  async function runOcr(file: File): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("kor+eng");
    const {
      data: { text },
    } = await worker.recognize(file);
    await worker.terminate();
    return text;
  }

  async function handleIdPhoto(file: File) {
    setOcrBusy(true);
    setOcrText("");
    setError("");
    try {
      const text = await runOcr(file);
      setOcrText(text);
      const idMatch = text.match(ID_FRONT_RE);
      const name = extractName(text);
      setForm((f) => ({
        ...f,
        name: name || f.name,
        idFront: idMatch ? idMatch[1] : f.idFront,
      }));
    } catch {
      setError("신분증 인식에 실패했어요. 직접 입력해주세요.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleBankPhoto(file: File) {
    setOcrBusy(true);
    setOcrText("");
    setError("");
    try {
      const text = await runOcr(file);
      setOcrText(text);
      const accountMatch = text.match(ACCOUNT_RE);
      const bank = extractBankName(text);
      setForm((f) => ({
        ...f,
        bankName: bank || f.bankName,
        account: accountMatch ? accountMatch[1].replace(/[\s-]/g, "") : f.account,
      }));
    } catch {
      setError("통장 인식에 실패했어요. 직접 입력해주세요.");
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

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="wi-upload-btn"
            style={{ flex: 1 }}
            onClick={() => idFileInputRef.current?.click()}
            disabled={ocrBusy}
          >
            🪪 {ocrBusy ? "인식 중..." : "신분증 → 이름·주민번호"}
          </button>
          <button
            className="wi-upload-btn"
            style={{ flex: 1 }}
            onClick={() => bankFileInputRef.current?.click()}
            disabled={ocrBusy}
          >
            🏦 {ocrBusy ? "인식 중..." : "통장 → 은행·계좌번호"}
          </button>
        </div>
        <div className="progress-auto-sub" style={{ textAlign: "left", marginTop: 4 }}>
          주민등록증·운전면허증 사진은 왼쪽, 통장 사본·통장 사진은 오른쪽 버튼으로 올려주세요.
        </div>
        <input
          ref={idFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleIdPhoto(f);
            e.target.value = "";
          }}
        />
        <input
          ref={bankFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleBankPhoto(f);
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
