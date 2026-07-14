"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Project, formatWon, fmtDate } from "@/lib/erp";
import { buildDailyReportDoc } from "@/lib/dailyReportDoc";
import { api } from "@/lib/api";

export default function PrintDailyReportPage() {
  const params = useParams<{ projectId: string; date: string }>();
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

  const date = decodeURIComponent(params.date);
  const doc = project ? buildDailyReportDoc(project, date) : null;
  const receiptIds = doc ? doc.receipts.map((r) => r.logId).join(",") : "";

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
  if (!project || !doc) return <div style={{ padding: 40 }}>공사를 찾을 수 없어요.</div>;

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
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th, td { border: 1px solid #999; padding: 5px 7px; font-size: 12px; text-align: center; }
        th { background: #eee; font-weight: 700; }
        .section-title { font-size: 13px; font-weight: 700; margin: 14px 0 6px; }
        .meta-table td { text-align: left; }
        .meta-table td.label { background: #f5f5f2; font-weight: 700; width: 90px; text-align: center; }
        .num { text-align: right; font-family: 'Consolas', monospace; }
        .work-content { border: 1px solid #999; min-height: 50px; padding: 8px; font-size: 12px; white-space: pre-wrap; }
        .grand-total {
          display: flex; justify-content: space-between; padding: 10px 14px; margin-top: 16px;
          background: #1b3a4b; color: #fff; font-weight: 700; border-radius: 6px;
        }
        .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
        .receipt-card { border: 1px solid #999; border-radius: 4px; padding: 6px; break-inside: avoid; }
        .receipt-card img { width: 100%; display: block; border-radius: 2px; }
        .receipt-caption { font-size: 11px; text-align: center; margin-bottom: 6px; font-weight: 700; }
        @media print {
          body { background: #fff; }
          .print-toolbar { display: none; }
          .print-page { max-width: none; padding: 0; }
        }
      `}</style>

      <div className="print-toolbar">
        <button onClick={() => window.print()}>🖨 인쇄 / PDF로 저장</button>
      </div>

      <div className="doc-title">현 장 운 영 일 보</div>
      <div className="doc-sub">{fmtDate(doc.date)}</div>

      <table className="meta-table">
        <tbody>
          <tr>
            <td className="label">공사명</td>
            <td colSpan={3}>{doc.projectName}</td>
          </tr>
          <tr>
            <td className="label">회사</td>
            <td>{doc.company}</td>
            <td className="label">계약금액</td>
            <td className="num">{formatWon(doc.contractAmount)}원</td>
          </tr>
          <tr>
            <td className="label">착공일</td>
            <td>{fmtDate(doc.startDate)}</td>
            <td className="label">준공(예정)일</td>
            <td>{fmtDate(doc.endDate)}</td>
          </tr>
          <tr>
            <td className="label">누적 노무비</td>
            <td className="num">{formatWon(doc.cumLabor)}원</td>
            <td className="label">누적 경비(장비)</td>
            <td className="num">{formatWon(doc.cumEquip)}원</td>
          </tr>
          <tr>
            <td className="label">누적 재료비</td>
            <td className="num">{formatWon(doc.cumMaterial)}원</td>
            <td className="label">누적 순공사비</td>
            <td className="num" style={{ fontWeight: 700 }}>
              {formatWon(doc.cumTotal)}원
            </td>
          </tr>
          <tr>
            <td className="label">공정률</td>
            <td colSpan={3} className="num" style={{ textAlign: "left", fontWeight: 700 }}>
              {doc.progressPct}%
            </td>
          </tr>
        </tbody>
      </table>

      <div className="section-title">금 일 작 업</div>
      <div className="work-content">{doc.workContent || "-"}</div>

      <div className="section-title">인 력 투 입</div>
      {doc.laborRows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>금일 투입 내역 없음</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>직종</th>
              <th>성명</th>
              <th>단가</th>
              <th>공수</th>
              <th>금액</th>
              <th>누계금액</th>
            </tr>
          </thead>
          <tbody>
            {doc.laborRows.map((r) => (
              <tr key={r.id}>
                <td>{r.jobType}</td>
                <td>{r.name}</td>
                <td className="num">{formatWon(r.rate)}</td>
                <td className="num">{r.qty}</td>
                <td className="num">{formatWon(r.amount)}</td>
                <td className="num">{formatWon(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-title">장 비 투 입 (대)</div>
      {doc.equipRows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>금일 투입 내역 없음</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>장비명</th>
              <th>단가</th>
              <th>공수</th>
              <th>금액</th>
              <th>누계금액</th>
            </tr>
          </thead>
          <tbody>
            {doc.equipRows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="num">{formatWon(r.rate)}</td>
                <td className="num">{r.qty}</td>
                <td className="num">{formatWon(r.amount)}</td>
                <td className="num">{formatWon(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-title">자 재 · 식 대 · 운 반 비 투 입</div>
      {doc.materialRows.length === 0 && doc.mealRows.length === 0 ? (
        <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>금일 투입 내역 없음</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>구분</th>
              <th>품목</th>
              <th>단위</th>
              <th>금액</th>
              <th>누계금액</th>
            </tr>
          </thead>
          <tbody>
            {[...doc.materialRows, ...doc.mealRows].map((r) => (
              <tr key={r.id}>
                <td>{r.type}</td>
                <td>{r.name}</td>
                <td>{r.unit}</td>
                <td className="num">{formatWon(r.amount)}</td>
                <td className="num">{formatWon(r.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grand-total">
        <span>금일 투입 합계</span>
        <b>{formatWon(doc.todayTotal)}원</b>
      </div>
      <div className="grand-total" style={{ marginTop: 6, background: "#333" }}>
        <span>누적 총 투입비</span>
        <b>{formatWon(doc.cumTotal)}원</b>
      </div>

      {doc.receipts.length > 0 && (
        <>
          <div className="section-title" style={{ pageBreakBefore: "always", paddingTop: 20 }}>
            첨 부 : 영 수 증 · 세 금 계 산 서 (백데이터)
          </div>
          <div className="receipt-grid">
            {doc.receipts.map((r) => (
              <div className="receipt-card" key={r.logId}>
                <div className="receipt-caption">
                  {r.type} · {r.name} · {formatWon(r.amount)}원
                </div>
                {receiptImages[r.logId] ? (
                  <img src={receiptImages[r.logId]} alt={r.name} />
                ) : (
                  <div style={{ fontSize: 11, color: "#888", padding: 20, textAlign: "center" }}>
                    불러오는 중...
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
