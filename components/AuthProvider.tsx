"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AppUser } from "@/lib/erp";

interface AuthCtx {
  user: AppUser;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

const STORAGE_KEY = "erp_user";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<{ hasUsers: boolean; names: string[] } | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) setUser(JSON.parse(s));
    } catch {
      /* ignore */
    }
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ hasUsers: true, names: [] }));
  }, []);

  function saveUser(u: AppUser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    // 상태(이름 목록) 새로고침
    fetch("/api/auth").then((r) => r.json()).then(setStatus).catch(() => {});
  }

  if (!mounted) {
    return (
      <div className="app">
        <div className="loading">불러오는 중...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen status={status} onLogin={saveUser} onStatusRefresh={setStatus} />;
  }

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}

function LoginScreen({
  status,
  onLogin,
  onStatusRefresh,
}: {
  status: { hasUsers: boolean; names: string[] } | null;
  onLogin: (u: AppUser) => void;
  onStatusRefresh: (s: { hasUsers: boolean; names: string[] }) => void;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!status) {
    return (
      <div className="app">
        <div className="loading">불러오는 중...</div>
      </div>
    );
  }

  const firstRun = !status.hasUsers;

  async function submit() {
    setError("");
    if (!name.trim()) {
      setError(firstRun ? "관리자 이름을 입력해주세요." : "이름을 선택해주세요.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("비밀번호는 숫자 4자리예요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: firstRun ? "bootstrap" : "login", name: name.trim(), pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "로그인에 실패했어요.");
        return;
      }
      if (firstRun) {
        onStatusRefresh({ hasUsers: true, names: [body.user.name] });
      }
      onLogin(body.user);
    } catch {
      setError("연결에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 13px",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 16,
    background: "#fff",
    color: "var(--ink)",
    marginTop: 6,
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>
          혜송·신진 <span>공사현황관리</span>
        </h1>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 420, margin: "0 auto" }}>
        <div className="wi-box">
          <div className="wi-summary" style={{ fontSize: 16 }}>
            {firstRun ? "관리자 계정 만들기 (최초 1회)" : "로그인"}
          </div>
          <div style={{ fontSize: 12.5, color: "#8a8371", margin: "6px 0 12px" }}>
            {firstRun
              ? "처음 실행이에요. 관리자(본사) 계정을 먼저 만들어주세요. 이후 관리자 화면에서 직원을 등록하고 담당 현장을 지정할 수 있어요."
              : "이름을 고르고 4자리 비밀번호를 입력하세요."}
          </div>

          {error && (
            <div className="login-error" style={{ marginBottom: 10 }}>
              {error}
            </div>
          )}

          <label style={{ fontSize: 12.5, color: "#8a8371", fontWeight: 600 }}>이름</label>
          {firstRun || status.names.length === 0 ? (
            <input
              style={inputStyle}
              value={name}
              placeholder="이름"
              onChange={(e) => setName(e.target.value)}
            />
          ) : (
            <select style={inputStyle} value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">— 이름 선택 —</option>
              {status.names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}

          <label style={{ fontSize: 12.5, color: "#8a8371", fontWeight: 600, display: "block", marginTop: 12 }}>
            비밀번호 (숫자 4자리)
          </label>
          <input
            style={{ ...inputStyle, letterSpacing: 6, textAlign: "center" }}
            value={pin}
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />

          <button className="btn-primary" onClick={submit} disabled={busy} style={{ marginTop: 16 }}>
            {busy ? "처리 중..." : firstRun ? "관리자 계정 만들기" : "로그인"}
          </button>
        </div>
      </div>
    </div>
  );
}
