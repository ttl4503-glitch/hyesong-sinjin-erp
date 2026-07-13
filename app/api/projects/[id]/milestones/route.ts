import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "일정 이름을 입력해주세요." }, { status: 400 });
  }
  const milestone = await prisma.milestone.create({
    data: {
      projectId: params.id,
      title: String(body.title).trim(),
      date: body.date || "",
      done: false,
    },
  });
  return NextResponse.json(milestone);
}
