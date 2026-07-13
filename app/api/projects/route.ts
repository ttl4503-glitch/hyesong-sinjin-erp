import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    include: { milestones: true, laborLogs: true, workItems: true, dailyNotes: true },
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
    include: { milestones: true, laborLogs: true, workItems: true, dailyNotes: true },
  });
  return NextResponse.json(project);
}
