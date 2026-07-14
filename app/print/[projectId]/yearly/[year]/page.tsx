"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Project, formatWon, fmtDate } from "@/lib/erp";
import { api } from "@/lib/api";

export default function PrintYearlyBackupPage() {
  const params = useParams<{ projectId: string; year: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptImages, setReceiptImages] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((projects: Project[]) => {
        setProject(projects.find((p) => p.id === params.projectId) || null);
      })
      .finally(() => setLoading(false));
  }, [params.projectId]);

  const year = params.year;
  const receiptLogs = project
    ? project.laborLogs
        .filter((l) => (l.date || "").startsWith(year) && !!l.receipt)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];
  const receiptIds = receiptLogs.map((l) => l.id).join(",");

  useEffect(() => {
    if (!receiptIds) return;
    const ids = receiptIds.split(",");
    Promise.all(
      ids.map((id) =>
        api
          .getReceipt(id)
          .then(({ imageData }) => [id, imageData] as const)
          .catch(() => [id, ""] as const)
      )
    ).then((pairs) => {
      setReceiptImages(Object.fromEntries(pairs.filter(([, v]) => v)));
    });
  }, [receiptIds]);

  if (loading) return <div style={{ padding: 40 }}>불러오는 중...</div>;
  if (!project) return <div style={{ padding: 40 }}>공사를 찾을 수 없어요.</div>;

  const grouped = Object.values(
    receiptLogs.reduce<Record<string, { date: string; logs: typeof receiptLogs }>>((acc, l) => {
      const d = l.date || "날짜 미상";
      if (!acc[d]) acc[d] = { date: d, logs: [] };
      acc[d].logs.push(l);
      return acc;
    }, {})
  );
  const yearTotal = receiptLogs.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <div className="print-page">
      <style>{`
        * { box-sizing: border-box; }
        body { background: #e8e6e0; }
        .print-page {
          max-width: 800px; margin: 0 auto; background: #fff; padding: 24px 28px;
          font-family: 'Malgun Gothic', -apple-system, sans-serif; color: #111; font-size: 13px;
        }
        .print-toolbar { text-align: right; margin-bottom: 16px; }
        .print-toolbar button {
          padding: 9px 16px; border: 1px solid #1b3a4b; border-radius: 6px; background: #1b3a4b;
          color: #fff; font-weight: 700; font-size: 13px; cursor: pointer;
        }
        .doc-title { text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 6px; margin-bottom: 4px; }
        .doc-sub { text-align: center; font-size: 12px; color: #555; margin-bottom: 16px; }
        .grand-total {
          display: flex; justify-content: space-between; padding: 10px 14px; margin: 16px 0;
          background: #1b3a4b; color: #fff; font-weight: 700; border-radius: 6px;
        }
        .date-title { font-size: 13px; font-weight: 700; margin: 18px 0 6px; border-bottom: 2px solid #1b3a4b; padding-bottom: 3px; }
        .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
        .receipt-card { border: 1px solid #999; border-radius: 4px; padding: 6px; break-inside: avoid; }
        .receipt-card img { width: 100%; display: block; border-radius: 2px; }
        .receipt-caption { font-size: 11px; text-align: center; margin-bottom: 6px; font-weight: 700; }
        @media print {
          body { background: #fff; }
          .print-toolbar { display: none; }
          .print-page { max-width: none; padding: 0; }
          .date-title { page-break-before: always; }
        }
      `}</style>

      <div className="print-toolbar">
        <button onClick={() => window.print()}>🖨 인쇄 / PDF로 저장</button>
      </div>

      <div className="doc-title">연 간 증 빙 백 데 이 터</div>
      <div className="doc-sub">
        {project.name} ({project.company}) · {year}년
      </div>

      <div className="grand-total">
        <span>{year}년 증빙 첨부 합계 ({receiptLogs.length}건)</span>
        <b>{formatWon(yearTotal)}원</b>
      </div>

      {grouped.length === 0 && (
        <div style={{ fontSize: 12, color: "#888", padding: "20px 0" }}>
          {year}년에 첨부된 영수증/세금계산서가 없어요.
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.date}>
          <div className="date-title">{fmtDate(g.date)}</div>
          <div className="receipt-grid">
            {g.logs.map((l) => (
              <div className="receipt-card" key={l.id}>
                <div className="receipt-caption">
                  {l.type} · {l.name} · {formatWon(l.amount)}원
                </div>
                {receiptImages[l.id] ? (
                  <img src={receiptImages[l.id]} alt={l.name} />
                ) : (
                  <div style={{ fontSize: 11, color: "#888", padding: 20, textAlign: "center" }}>
                    불러오는 중...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
