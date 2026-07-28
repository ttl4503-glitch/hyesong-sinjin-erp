import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.jobType !== undefined) data.jobType = String(body.jobType).trim();
  if (body.idFront !== undefined) data.idFront = String(body.idFront).trim();
  if (body.phone !== undefined) data.phone = String(body.phone).trim();
  if (body.bankName !== undefined) data.bankName = String(body.bankName).trim();
  if (body.account !== undefined) data.account = String(body.account).trim();

  const worker = await prisma.worker.update({ where: { id: params.id }, data });
  return NextResponse.json(worker);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  await prisma.worker.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
