import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.company !== undefined) data.company = body.company;
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.location !== undefined) data.location = String(body.location).trim();
  if (body.startDate !== undefined) data.startDate = body.startDate;
  if (body.endDate !== undefined) data.endDate = body.endDate;
  if (body.contractAmount !== undefined) data.contractAmount = Number(body.contractAmount) || 0;
  if (body.progress !== undefined) data.progress = Number(body.progress) || 0;
  if (body.memo !== undefined) data.memo = String(body.memo).trim();

  const project = await prisma.project.update({
    where: { id: params.id },
    data,
    include: { milestones: true, laborLogs: { include: { receipt: { select: { id: true } } } }, workItems: true, dailyNotes: true },
  });
  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
