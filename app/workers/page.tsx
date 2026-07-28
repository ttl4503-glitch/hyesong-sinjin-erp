"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getKnownNames, getKnownJobTypes, type Project, type Worker } from "@/lib/erp";
import { useAuth } from "@/components/AuthProvider";

const ID_FULL_RE = /\b(\d{6})[-\s]?(\d{7})\b/;
const ID_FRONT_ONLY_RE = /\b(\d{6})\b/;
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
  return { name: "", jobType: "", idFront: "", phone: "", bankName: "", account: "" };
}

// 동명이인을 구분해서 보여줄 배경색 — 같은 이름이 여러 명이면 이름별로 색을 하나씩 배정한다.
const DUP_COLORS = ["#ffe0e0", "#fff3cd", "#d4edda", "#d1ecf1", "#ece0f8"];

export default function WorkersPage() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const idFileInputRef = useRef<HTMLInputElement>(null);
  const bankFileInputRef = useRef<HTMLInputElement>(null);

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // 목록에서 ✎를 누르면 그 자리에서 바로 수정 — 위쪽 등록 폼과는 별개의 상태로 관리한다.
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState(emptyForm());
  const [inlineError, setInlineError] = useState("");
  const [inlineSaving, setInlineSaving] = useState(false);

  function startInlineEdit(w: Worker) {
    setInlineEditId(w.id);
    setInlineForm({
      name: w.name,
      jobType: w.jobType,
      idFront: w.idFront,
      phone: w.phone,
      bankName: w.bankName,
      account: w.account,
    });
    setInlineError("");
  }

  function cancelInlineEdit() {
    setInlineEditId(null);
    setInlineForm(emptyForm());
    setInlineError("");
  }

  async function handleInlineSave() {
    if (!inlineEditId) return;
    if (isFormBlank(inlineForm)) {
      setInlineError("이름·주민번호 등 하나 이상은 입력해주세요.");
      return;
    }
    setInlineError("");
    setInlineSaving(true);
    try {
      const updated = await api.updateWorker(inlineEditId, inlineForm);
      setWorkers((prev) => prev.map((w) => (w.id === inlineEditId ? updated : w)));
      cancelInlineEdit();
    } catch (e: any) {
      setInlineError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setInlineSaving(false);
    }
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!user.isAdmin) {
      setLoading(false);
      return;
    }
    Promise.all([api.listWorkers(), api.listProjects()])
      .then(([ws, ps]) => {
        setWorkers(ws);
        setProjects(ps);
      })
      .finally(() => setLoading(false));
  }, [user.isAdmin]);

  // 작업일보(인력 투입 기록)에 이미 쓰인 이름·직종을 자동완성 후보로 제공 —
  // 명부에 등록할 때 작업일보와 표기가 어긋나지 않도록 돕는다.
  const knownPersonNames = getKnownNames(projects).filter((k) => k.type === "인력");
  const knownJobTypes = getKnownJobTypes(projects);

  function resetForm() {
    setForm(emptyForm());
    setOcrText("");
    setError("");
  }

  function isFormBlank(f: typeof form) {
    return !f.name.trim() && !f.jobType.trim() && !f.idFront.trim() && !f.phone.trim() && !f.bankName.trim() && !f.account.trim();
  }

  async function handleSave() {
    if (isFormBlank(form)) {
      setError("이름·주민번호 등 하나 이상은 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const created = await api.createWorker(form);
      setWorkers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      resetForm();
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
    if (inlineEditId === id) cancelInlineEdit();
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
      const fullMatch = text.match(ID_FULL_RE);
      const frontMatch = text.match(ID_FRONT_ONLY_RE);
      const idNumber = fullMatch ? fullMatch[1] + fullMatch[2] : frontMatch ? frontMatch[1] : "";
      const name = extractName(text);
      setForm((f) => ({
        ...f,
        name: name || f.name,
        idFront: idNumber || f.idFront,
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

  if (!user.isAdmin) {
    return (
      <div className="app">
        <div className="topbar">
          <h1>
            인원 명부 <span>주민번호·계좌 관리</span>
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
        <div className="wi-summary">새 인원 등록</div>
        {error && <div className="login-error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="row2" style={{ marginTop: 10 }}>
          <div className="field">
            <label>이름</label>
            <input
              value={form.name}
              list="worker_name_options"
              onChange={(e) => {
                const name = e.target.value;
                const known = knownPersonNames.find((k) => k.name === name);
                setForm((f) => ({ ...f, name, jobType: known?.jobType ? known.jobType : f.jobType }));
              }}
            />
            <datalist id="worker_name_options">
              {knownPersonNames.map((k) => (
                <option key={k.name} value={k.name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>직종</label>
            <input
              value={form.jobType}
              list="worker_jobtype_options"
              onChange={(e) => setForm({ ...form, jobType: e.target.value })}
            />
            <datalist id="worker_jobtype_options">
              {knownJobTypes.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>주민번호</label>
            <input
              value={form.idFront}
              maxLength={14}
              placeholder="901231-1234567"
              onChange={(e) => setForm({ ...form, idFront: e.target.value })}
            />
          </div>
          <div className="field">
            <label>핸드폰번호</label>
            <input
              value={form.phone}
              placeholder="010-1234-5678"
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>은행명</label>
            <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </div>
          <div className="field">
            <label>계좌번호</label>
            <input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
          </div>
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
          {saving ? "저장 중..." : "등록"}
        </button>
      </div>

      <div className="section-label">
        <span>등록된 인원</span>
        <span>{workers.length}명</span>
      </div>

      <div style={{ padding: "0 16px 10px 16px" }}>
        <input
          type="text"
          placeholder="🔍 이름·직종·연락처로 조회"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "9px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 13,
            background: "#fff",
          }}
        />
      </div>

      <div className="list" style={{ paddingBottom: 40 }}>
        {(() => {
          // 동명이인 그룹마다 색을 하나씩 배정 — 같은 이름이 여러 명이면 구분되게 보여준다.
          const colorById = new Map<string, string>();
          const groups = new Map<string, string[]>();
          workers.forEach((w) => {
            if (!w.name.trim()) return; // 이름이 없으면 동명이인 판단 대상에서 제외
            if (!groups.has(w.name)) groups.set(w.name, []);
            groups.get(w.name)!.push(w.id);
          });
          groups.forEach((ids) => {
            if (ids.length > 1) ids.forEach((id, i) => colorById.set(id, DUP_COLORS[i % DUP_COLORS.length]));
          });

          const q = search.trim();
          const filtered = q
            ? workers.filter((w) => w.name.includes(q) || w.jobType.includes(q) || w.phone.includes(q))
            : workers;

          if (filtered.length === 0) {
            return <div className="empty">{q ? "검색 결과가 없어요." : "등록된 인원이 없어요."}</div>;
          }

          return filtered.map((w) => {
            if (inlineEditId === w.id) {
              return (
                <div className="user-row" key={w.id} style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}>
                  {inlineError && <div className="login-error" style={{ marginBottom: 8 }}>{inlineError}</div>}
                  <div className="row2">
                    <div className="field">
                      <label>이름</label>
                      <input
                        value={inlineForm.name}
                        onChange={(e) => setInlineForm({ ...inlineForm, name: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>직종</label>
                      <input
                        value={inlineForm.jobType}
                        onChange={(e) => setInlineForm({ ...inlineForm, jobType: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>주민번호</label>
                      <input
                        value={inlineForm.idFront}
                        maxLength={14}
                        onChange={(e) => setInlineForm({ ...inlineForm, idFront: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>핸드폰번호</label>
                      <input
                        value={inlineForm.phone}
                        onChange={(e) => setInlineForm({ ...inlineForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>은행명</label>
                      <input
                        value={inlineForm.bankName}
                        onChange={(e) => setInlineForm({ ...inlineForm, bankName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>계좌번호</label>
                      <input
                        value={inlineForm.account}
                        onChange={(e) => setInlineForm({ ...inlineForm, account: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button className="btn-primary" style={{ marginTop: 0 }} onClick={handleInlineSave} disabled={inlineSaving}>
                      {inlineSaving ? "저장 중..." : "수정 저장"}
                    </button>
                    <button className="btn-ghost" style={{ marginTop: 0 }} onClick={cancelInlineEdit}>
                      취소
                    </button>
                  </div>
                </div>
              );
            }

            const dupColor = colorById.get(w.id);
            const revealed = revealedIds.has(w.id);
            return (
              <div
                className="user-row"
                key={w.id}
                style={dupColor ? { background: dupColor } : undefined}
                onClick={() => toggleReveal(w.id)}
              >
                <div>
                  <div className="uname">
                    {w.name || <span style={{ color: "#a09a89", fontWeight: 400 }}>(이름 미입력)</span>}{" "}
                    {w.jobType && <span style={{ color: "#8a8371", fontWeight: 400 }}>· {w.jobType}</span>}
                    {dupColor && (
                      <span style={{ fontSize: 11, color: "#a3701f", marginLeft: 6, fontWeight: 700 }}>
                        ⚠ 동명이인
                      </span>
                    )}
                  </div>
                  <div className="uemail">
                    {w.idFront
                      ? revealed
                        ? w.idFront
                        : w.idFront.length > 6
                        ? `${w.idFront.slice(0, 6)}-${"●".repeat(w.idFront.length - 6)}`
                        : `${w.idFront}-●●●●●●●`
                      : "주민번호 미등록"}
                    {w.phone ? ` · ${w.phone}` : ""} · {w.bankName} {w.account}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                  <div className="lg-edit" onClick={() => startInlineEdit(w)}>
                    ✎
                  </div>
                  <div className="lg-del" onClick={() => handleDelete(w.id)}>
                    ✕
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
