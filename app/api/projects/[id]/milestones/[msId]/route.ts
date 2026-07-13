import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; msId: string } }
) {
  const body = await req.json();
  const milestone = await prisma.milestone.update({
    where: { id: params.msId },
    data: { done: Boolean(body.done) },
  });
  return NextResponse.json(milestone);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; msId: string } }
) {
  await prisma.milestone.delete({ where: { id: params.msId } });
  return NextResponse.json({ ok: true });
}
