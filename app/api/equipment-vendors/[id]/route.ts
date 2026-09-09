import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.contactName !== undefined) data.contactName = String(body.contactName).trim();
  if (body.bizRegNo !== undefined) data.bizRegNo = String(body.bizRegNo).trim();
  if (body.mobile !== undefined) data.mobile = String(body.mobile).trim();
  if (body.bankName !== undefined) data.bankName = String(body.bankName).trim();
  if (body.account !== undefined) data.account = String(body.account).trim();
  if (body.email !== undefined) data.email = String(body.email).trim();

  const vendor = await prisma.equipmentVendor.update({ where: { id: params.id }, data });
  return NextResponse.json(vendor);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  await prisma.equipmentVendor.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
