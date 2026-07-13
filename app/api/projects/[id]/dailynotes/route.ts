import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const date = String(body.date || "");
  const content = String(body.content || "").trim();
  if (!date) return NextResponse.json({ error: "날짜가 필요해요." }, { status: 400 });

  const note = await prisma.dailyNote.upsert({
    where: { projectId_date: { projectId: params.id, date } },
    update: { content },
    create: { projectId: params.id, date, content },
  });
  return NextResponse.json(note);
}
