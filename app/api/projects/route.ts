import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReqUser } from "@/lib/authServer";

export async function GET(req: NextRequest) {
  // 로그인 사용자가 일반 직원이면 담당 현장만, 관리자(또는 헤더 없음)는 전체
  const user = await getReqUser(req);
  const where = user && !user.isAdmin ? { id: { in: user.projectIds } } : {};
  const projects = await prisma.project.findMany({
    where,
    include: { milestones: true, laborLogs: { include: { receipt: { select: { id: true } } } }, workItems: true, dailyNotes: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "공사명을 입력해주세요." }, { status: 400 });
  }
  const project = await prisma.project.create({
    data: {
      company: body.company || "혜송산업개발",
      name: body.name.trim(),
      location: body.location?.trim() || "",
      startDate: body.startDate || "",
      endDate: body.endDate || "",
      contractAmount: Number(body.contractAmount) || 0,
      progress: Number(body.progress) || 0,
      memo: body.memo?.trim() || "",
    },
    include: { milestones: true, laborLogs: { include: { receipt: { select: { id: true } } } }, workItems: true, dailyNotes: true },
  });
  return NextResponse.json(project);
}
