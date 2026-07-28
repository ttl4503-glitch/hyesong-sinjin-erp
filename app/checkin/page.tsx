"use client";

import { useEffect, useState } from "react";
import { todayStr } from "@/lib/erp";

type Info = { siteName: string; isFixedSite: boolean; completed: boolean; names: string[]; equipNames: string[] };
type EntryType = "인력" | "장비";
type Result = { status: "checkin" | "checkout" | "already"; name: string; type: EntryType; siteName: string };

// 휴대폰(브라우저) 1대당 오늘 이 현장에서 인력/장비 각각 하나만 등록할 수 있게
// localStorage에 기록해둔다 (같은 사람·같은 장비의 퇴근 처리는 고정 현장에서 계속 허용).
function lockKey(type: EntryType, site: string, date: string) {
  return `hs_checkin_lock_${type}_${site}_${date}`;
}
function getLockedName(type: EntryType, site: string, date: string): string {
  try {
    return localStorage.getItem(lockKey(type, site, date)) || "";
  } catch {
    return "";
  }
}
function setLockedName(type: EntryType, site: string, date: string, name: string) {
  try {
    localStorage.setItem(lockKey(type, site, date), name);
  } catch {
    /* ignore */
  }
}

export default function CheckinPage() {
  const [site, setSite] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState("");
  const [type, setType] = useState<EntryType>("인력");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [lockedPerson, setLockedPerson] = useState("");
  const [lockedEquip, setLockedEquip] = useState("");
  const lockedName = type === "인력" ? lockedPerson : lockedEquip;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("site");
    setSite(s);
    if (!s) {
      setLoadError("QR 주소에 현장 정보가 없어요. 관리자에게 새 QR을 요청하세요.");
      return;
    }
    const person = getLockedName("인력", s, todayStr());
    const equip = getLockedName("장비", s, todayStr());
    setLockedPerson(person);
    setLockedEquip(equip);
    if (person) setName(person);
    fetch(`/api/checkin?site=${encodeURIComponent(s)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setLoadError(d.error);
        else setInfo(d);
      })
      .catch(() => setLoadError("현장 정보를 불러오지 못했어요. 잠시 후 다시 시도하세요."));
  }, []);

  function switchType(t: EntryType) {
    setType(t);
    setName(t === "인력" ? lockedPerson : lockedEquip);
    setError("");
  }

  async function submit() {
    setError("");
    if (!name.trim()) {
      setError(type === "장비" ? "장비명을 입력해주세요." : "이름을 선택(또는 입력)해주세요.");
      return;
    }
    if (lockedName && lockedName !== name.trim()) {
      setError(
        type === "장비"
          ? `이 휴대폰으로는 오늘 이미 '${lockedName}' 장비가 등록됐어요. 다른 장비는 다른 휴대폰으로 찍어주세요.`
          : `이 휴대폰으로는 오늘 이미 '${lockedName}'님이 출역했어요. 다른 분은 본인 휴대폰으로 QR을 찍어주세요.`
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, name: name.trim(), date: todayStr(), type }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "처리에 실패했어요.");
        return;
      }
      if (site) {
        setLockedName(type, site, todayStr(), name.trim());
        if (type === "인력") setLockedPerson(name.trim());
        else setLockedEquip(name.trim());
      }
      setResult(body);
    } catch {
      setError("연결에 실패했어요. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 460, margin: "0 auto", padding: 16 };
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #e3ddcf",
    borderRadius: 14,
    padding: 20,
  };

  // ===== 결과 화면 =====
  if (result) {
    const ok = result.status === "checkin" || result.status === "checkout";
    const isEquip = result.type === "장비";
    const title =
      result.status === "checkin"
        ? isEquip
          ? "장비 등록 완료!"
          : "출역 완료!"
        : result.status === "checkout"
        ? "퇴근 처리 완료!"
        : isEquip
        ? "이미 등록됐어요"
        : "이미 출역했어요";
    const sub =
      result.status === "checkin"
        ? "오늘 작업일보에 등록되었어요."
        : result.status === "checkout"
        ? "퇴근 시각이 기록되었어요."
        : "오늘은 이미 등록되어 있어요.";
    return (
      <div style={{ minHeight: "100vh", background: "#f4f1e9", paddingTop: 40 }}>
        <div style={wrap}>
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 48 }}>{ok ? "✅" : "ℹ️"}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: "#2f3a2f" }}>{title}</div>
            <div style={{ fontSize: 15, color: "#6b6555", marginTop: 6 }}>{sub}</div>
            <div style={{ marginTop: 16, padding: "12px 14px", background: "#f4f1e9", borderRadius: 10, fontSize: 15 }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  fontWeight: 700,
                  color: isEquip ? "#8a6d3b" : "#3f6f52",
                  marginBottom: 4,
                }}
              >
                {result.type}
              </span>
              <br />
              <b>{result.name}</b> · {result.siteName}
              <br />
              <span style={{ color: "#8a8371", fontSize: 13 }}>{todayStr()}</span>
            </div>
            <button
              onClick={() => {
                setResult(null);
                setName(lockedName);
              }}
              style={{
                marginTop: 18,
                width: "100%",
                padding: 13,
                border: "none",
                borderRadius: 10,
                background: "#3f6f52",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              계속 등록하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 로딩/오류 =====
  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f1e9", paddingTop: 40 }}>
        <div style={wrap}>
          <div style={{ ...card, textAlign: "center", color: "#b0392b" }}>{loadError}</div>
        </div>
      </div>
    );
  }
  if (!info) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f1e9", paddingTop: 60, textAlign: "center", color: "#8a8371" }}>
        불러오는 중...
      </div>
    );
  }

  const isEquip = type === "장비";
  const pill = (t: EntryType): React.CSSProperties => ({
    flex: 1,
    padding: "11px 0",
    textAlign: "center",
    borderRadius: 9,
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    border: "1px solid " + (type === t ? "#3f6f52" : "#d8d2c2"),
    background: type === t ? "#3f6f52" : "#fff",
    color: type === t ? "#fff" : "#6b6555",
  });

  // ===== 입력 화면 =====
  return (
    <div style={{ minHeight: "100vh", background: "#f4f1e9", paddingBottom: 40 }}>
      <div style={{ ...wrap, paddingTop: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "#8a8371" }}>출역 체크인</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#2f3a2f", marginTop: 2 }}>{info.siteName}</div>
          {info.isFixedSite && (
            <div style={{ fontSize: 12, color: "#3f6f52", marginTop: 4 }}>
              고정 현장 · 나갈 때 한 번 더 찍으면 퇴근 처리돼요
            </div>
          )}
        </div>

        <div style={card}>
          {error && (
            <div
              style={{
                background: "#fbe6e0",
                border: "1px solid #e6b0a2",
                color: "#b0392b",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13.5,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={pill("인력")} onClick={() => switchType("인력")}>👷 인력</div>
            <div style={pill("장비")} onClick={() => switchType("장비")}>🚜 장비</div>
          </div>

          <label style={{ fontSize: 13, color: "#6b6555", fontWeight: 600 }}>
            {isEquip ? "장비명" : "이름"}
          </label>
          <input
            list={isEquip ? "equip-names" : "worker-names"}
            value={name}
            disabled={!!lockedName}
            onChange={(e) => setName(e.target.value)}
            placeholder={isEquip ? "장비명 입력 (예: 굴삭기 0.6)" : "이름 선택 또는 입력"}
            style={{
              width: "100%",
              padding: "13px 14px",
              border: "1px solid #d8d2c2",
              borderRadius: 8,
              fontSize: 17,
              marginTop: 6,
              background: lockedName ? "#f0ede3" : "#fff",
            }}
          />
          {lockedName && (
            <div style={{ fontSize: 12.5, color: "#8a8371", marginTop: 6 }}>
              {isEquip ? (
                <>
                  이 휴대폰은 오늘 이 현장에서 <b>{lockedName}</b> 장비로 등록됐어요. 다른 장비는 다른 휴대폰으로 찍어주세요.
                </>
              ) : (
                <>
                  이 휴대폰은 오늘 이 현장에서 <b>{lockedName}</b>님으로 등록됐어요. 다른 분은 각자의 휴대폰으로 QR을 찍어주세요.
                </>
              )}
            </div>
          )}
          <datalist id="worker-names">
            {info.names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <datalist id="equip-names">
            {info.equipNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <button
            onClick={submit}
            disabled={busy}
            style={{
              marginTop: 18,
              width: "100%",
              padding: 16,
              border: "none",
              borderRadius: 10,
              background: busy ? "#9bb0a2" : "#3f6f52",
              color: "#fff",
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            {busy ? "처리 중..." : isEquip ? "장비 등록하기" : "출역하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
