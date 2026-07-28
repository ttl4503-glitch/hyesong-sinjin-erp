import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 공개 API (로그인 불필요) — 현장 QR을 찍은 작업자용.

// GET /api/checkin?site=<projectId>
// 현장 이름 + 고정현장 여부 + 인원 명부 이름 목록(민감정보 제외, 이름만)
export async function GET(req: NextRequest) {
  const site = req.nextUrl.searchParams.get("site") || "";
  if (!site) return NextResponse.json({ error: "현장 정보가 없어요." }, { status: 400 });
  const project = await prisma.project.findUnique({
    where: { id: site },
    select: { name: true, isFixedSite: true, completed: true },
  });
  if (!project) return NextResponse.json({ error: "현장을 찾을 수 없어요." }, { status: 404 });
  const workers = await prisma.worker.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return NextResponse.json({
    siteName: project.name,
    isFixedSite: project.isFixedSite,
    completed: project.completed,
    names: workers.map((w) => w.name),
  });
}

// POST /api/checkin  { site, name, date, selfie?, lat?, lng? }
// 오늘 그 현장 작업일보에 '인력 1공수'를 자동 등록. 하루 1회 중복 방지.
// 고정현장이면 두 번째 스캔 시 퇴근 시각 기록.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const site = String(body.site || "");
  const name = String(body.name || "").trim();
  const date = String(body.date || "").trim();
  const selfie: string | null = typeof body.selfie === "string" && body.selfie ? body.selfie : null;
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lng = typeof body.lng === "number" ? body.lng : null;

  if (!site) return NextResponse.json({ error: "현장 정보가 없어요." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "이름을 선택해주세요." }, { status: 400 });
  if (!date) return NextResponse.json({ error: "날짜 정보가 없어요." }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: site },
    select: { id: true, name: true, isFixedSite: true },
  });
  if (!project) return NextResponse.json({ error: "현장을 찾을 수 없어요." }, { status: 404 });

  // 오늘 이 현장에서 이 사람의 QR 출역 기록이 이미 있는지
  const existing = await prisma.laborLog.findFirst({
    where: { projectId: site, date, name, source: "qr" },
  });

  if (existing) {
    // 고정현장이고 아직 퇴근 안 찍었으면 → 퇴근 처리
    if (project.isFixedSite && !existing.checkOutAt) {
      await prisma.laborLog.update({ where: { id: existing.id }, data: { checkOutAt: new Date() } });
      return NextResponse.json({ status: "checkout", name, siteName: project.name });
    }
    return NextResponse.json({ status: "already", name, siteName: project.name });
  }

  // 이 사람의 최근 인력 기록에서 직종·단가 자동 채움
  const known = await prisma.laborLog.findFirst({
    where: { name, type: "인력" },
    orderBy: { date: "desc" },
    select: { jobType: true, rate: true },
  });
  const rate = known?.rate || 0;

  const log = await prisma.laborLog.create({
    data: {
      projectId: site,
      type: "인력",
      jobType: known?.jobType || "",
      name,
      qty: 1,
      unit: "공수",
      rate,
      amount: rate * 1,
      date,
      note: "QR 출역",
      source: "qr",
      checkInAt: new Date(),
    },
  });

  if (selfie) {
    await prisma.checkinPhoto.create({
      data: { laborLogId: log.id, imageData: selfie, gpsLat: lat, gpsLng: lng },
    });
  }

  return NextResponse.json({ status: "checkin", name, siteName: project.name });
}
