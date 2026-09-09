"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { EquipmentVendor } from "@/lib/erp";
import { useAuth } from "@/components/AuthProvider";

function emptyForm() {
  return { name: "", contactName: "", bizRegNo: "", mobile: "", bankName: "", account: "", email: "" };
}

export default function EquipmentVendorsPage() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<EquipmentVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineForm, setInlineForm] = useState(emptyForm());
  const [inlineError, setInlineError] = useState("");
  const [inlineSaving, setInlineSaving] = useState(false);

  useEffect(() => {
    if (!user.isAdmin) {
      setLoading(false);
      return;
    }
    api
      .listEquipmentVendors()
      .then(setVendors)
      .finally(() => setLoading(false));
  }, [user.isAdmin]);

  function isFormBlank(f: typeof form) {
    return Object.values(f).every((v) => !v.trim());
  }

  function resetForm() {
    setForm(emptyForm());
    setError("");
  }

  async function handleSave() {
    if (isFormBlank(form)) {
      setError("상호 등 하나 이상은 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const created = await api.createEquipmentVendor(form);
      setVendors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      resetForm();
    } catch (e: any) {
      setError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  function startInlineEdit(v: EquipmentVendor) {
    setInlineEditId(v.id);
    setInlineForm({
      name: v.name,
      contactName: v.contactName,
      bizRegNo: v.bizRegNo,
      mobile: v.mobile,
      bankName: v.bankName,
      account: v.account,
      email: v.email,
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
      setInlineError("상호 등 하나 이상은 입력해주세요.");
      return;
    }
    setInlineError("");
    setInlineSaving(true);
    try {
      const updated = await api.updateEquipmentVendor(inlineEditId, inlineForm);
      setVendors((prev) => prev.map((v) => (v.id === inlineEditId ? updated : v)));
      cancelInlineEdit();
    } catch (e: any) {
      setInlineError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setInlineSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 장비업체를 삭제할까요? 관리자가 휴지통에서 복구할 수 있어요.")) return;
    await api.deleteEquipmentVendor(id);
    setVendors((prev) => prev.filter((v) => v.id !== id));
    if (inlineEditId === id) cancelInlineEdit();
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
            장비 <span>명부 관리</span>
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

  const q = search.trim();
  const filtered = q
    ? vendors.filter((v) => v.name.includes(q) || v.contactName.includes(q) || v.mobile.includes(q))
    : vendors;

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          장비 <span>명부 관리</span>
        </h1>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <Link href="/" className="back-link">
          ← 돌아가기
        </Link>
      </div>

      <div style={{ padding: "12px 16px 0 16px" }}>
        <div className="progress-auto-sub" style={{ textAlign: "left" }}>
          장비를 임대하는 업체 정보를 등록해두면, 작업일보에서 장비 항목에 상호를 입력할 때 장비·자재·운반비
          집계 엑셀에 사업자등록번호·연락처·계좌 정보가 자동으로 정리돼요.
        </div>
      </div>

      <div className="wi-box" style={{ margin: "12px 16px 16px 16px" }}>
        <div className="wi-summary">새 장비업체 등록</div>
        {error && (
          <div className="login-error" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <div className="row2" style={{ marginTop: 10 }}>
          <div className="field">
            <label>상호</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>이름 (담당자)</label>
            <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>사업자등록번호</label>
            <input
              value={form.bizRegNo}
              placeholder="123-45-67890"
              onChange={(e) => setForm({ ...form, bizRegNo: e.target.value })}
            />
          </div>
          <div className="field">
            <label>휴대폰</label>
            <input
              value={form.mobile}
              placeholder="010-1234-5678"
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
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
        <div className="field">
          <label>이메일</label>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "등록"}
        </button>
      </div>

      <div className="section-label">
        <span>등록된 장비업체</span>
        <span>{vendors.length}곳</span>
      </div>

      <div style={{ padding: "0 16px 10px 16px" }}>
        <input
          type="text"
          placeholder="🔍 상호·담당자·휴대폰으로 조회"
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
        {filtered.length === 0 ? (
          <div className="empty">{q ? "검색 결과가 없어요." : "등록된 장비업체가 없어요."}</div>
        ) : (
          filtered.map((v) => {
            if (inlineEditId === v.id) {
              return (
                <div
                  className="user-row"
                  key={v.id}
                  style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}
                >
                  {inlineError && (
                    <div className="login-error" style={{ marginBottom: 8 }}>
                      {inlineError}
                    </div>
                  )}
                  <div className="row2">
                    <div className="field">
                      <label>상호</label>
                      <input
                        value={inlineForm.name}
                        onChange={(e) => setInlineForm({ ...inlineForm, name: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>이름 (담당자)</label>
                      <input
                        value={inlineForm.contactName}
                        onChange={(e) => setInlineForm({ ...inlineForm, contactName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="row2">
                    <div className="field">
                      <label>사업자등록번호</label>
                      <input
                        value={inlineForm.bizRegNo}
                        onChange={(e) => setInlineForm({ ...inlineForm, bizRegNo: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>휴대폰</label>
                      <input
                        value={inlineForm.mobile}
                        onChange={(e) => setInlineForm({ ...inlineForm, mobile: e.target.value })}
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
                  <div className="field">
                    <label>이메일</label>
                    <input
                      value={inlineForm.email}
                      onChange={(e) => setInlineForm({ ...inlineForm, email: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      className="btn-primary"
                      style={{ marginTop: 0 }}
                      onClick={handleInlineSave}
                      disabled={inlineSaving}
                    >
                      {inlineSaving ? "저장 중..." : "수정 저장"}
                    </button>
                    <button className="btn-ghost" style={{ marginTop: 0 }} onClick={cancelInlineEdit}>
                      취소
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="user-row" key={v.id}>
                <div>
                  <div className="uname">
                    {v.name || <span style={{ color: "#a09a89", fontWeight: 400 }}>(상호 미입력)</span>}{" "}
                    {v.contactName && <span style={{ color: "#8a8371", fontWeight: 400 }}>· {v.contactName}</span>}
                  </div>
                  <div className="uemail">
                    {v.bizRegNo || "사업자번호 미등록"}
                    {v.mobile ? ` · ${v.mobile}` : ""}
                    {v.bankName || v.account ? ` · ${v.bankName} ${v.account}` : ""}
                    {v.email ? ` · ${v.email}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="lg-edit" onClick={() => startInlineEdit(v)}>
                    ✎
                  </div>
                  <div className="lg-del" onClick={() => handleDelete(v.id)}>
                    ✕
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
