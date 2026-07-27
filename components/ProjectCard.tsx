import { Project, computeProgress, daysUntil, fmtDate, formatWon, totalInvestedCost } from "@/lib/erp";

export default function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const dleft = project.completed ? null : daysUntil(project.endDate);
  const progressVal = computeProgress(project);
  const over = progressVal > 100;
  const late = !project.completed && dleft !== null && dleft < 0 && progressVal < 100;
  const tagClass =
    project.company === "혜송산업개발" ? "hyesong" : project.company === "신진조경" ? "sinjin" : "narin";

  let ddayText = "-";
  if (dleft !== null) {
    ddayText = dleft === 0 ? "D-DAY" : dleft > 0 ? `D-${dleft}` : `${Math.abs(dleft)}일 초과`;
  }

  return (
    <div className="card" onClick={onClick}>
      <div className="card-top">
        <div>
          <div className="card-title">{project.name}</div>
          <div className="card-loc">{project.location || "위치 미입력"}</div>
        </div>
        <div className={`tag ${tagClass}`}>{project.company}</div>
      </div>
      <div className="gauge">
        <div className="gauge-top">
          <div className="gauge-period">
            {fmtDate(project.startDate)} ~ {fmtDate(project.endDate)}
          </div>
          {!project.completed && (
            <div className={`dday ${late ? "late" : ""}`} style={{ fontWeight: 700 }}>
              남은 공기 {ddayText}
            </div>
          )}
        </div>
        <div className="ruler">
          <div
            className={`ruler-fill ${over ? "over" : late ? "late" : ""}`}
            style={{ width: `${Math.min(100, progressVal)}%` }}
          />
          <div className="ruler-ticks">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} />
            ))}
          </div>
        </div>
      </div>
      <div className="status-row" style={{ justifyContent: "flex-start", gap: 6 }}>
        <span>공사금액 {project.contractAmount ? formatWon(project.contractAmount) + "원" : "미입력"}</span>
        <span>→</span>
        <span style={{ color: over ? "var(--danger)" : undefined, fontWeight: 700 }}>
          누적 투입 {formatWon(totalInvestedCost(project))}원 ({progressVal}%)
        </span>
      </div>
    </div>
  );
}
