import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.jobType !== undefined) data.jobType = String(body.jobType).trim();
  if (body.idFront !== undefined) data.idFront = String(body.idFront).trim();
  if (body.bankName !== undefined) data.bankName = String(body.bankName).trim();
  if (body.account !== undefined) data.account = String(body.account).trim();

  const worker = await prisma.worker.update({ where: { id: params.id }, data });
  return NextResponse.json(worker);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.worker.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
