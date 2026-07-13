import { Project, computeProgress, daysUntil, fmtDate, formatWon, totalInvestedCost } from "@/lib/erp";

export default function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const dleft = daysUntil(project.endDate);
  const progressVal = computeProgress(project);
  const over = progressVal > 100;
  const late = dleft !== null && dleft < 0 && progressVal < 100;
  const tagClass = project.company === "혜송산업개발" ? "hyesong" : "sinjin";

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
          <div className="gauge-pct" style={over ? { color: "var(--danger)" } : undefined}>
            {progressVal}%
          </div>
          <div className="gauge-period">
            {fmtDate(project.startDate)} ~ {fmtDate(project.endDate)}
          </div>
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
      <div className="status-row">
        <span>누적 투입비용 {formatWon(totalInvestedCost(project))}원</span>
        <span className={`dday ${late ? "late" : ""}`}>{ddayText}</span>
      </div>
    </div>
  );
}
