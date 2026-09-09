import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const vendors = await prisma.equipmentVendor.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  return NextResponse.json(vendors);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  const contactName = String(body.contactName || "").trim();
  const bizRegNo = String(body.bizRegNo || "").trim();
  const mobile = String(body.mobile || "").trim();
  const bankName = String(body.bankName || "").trim();
  const account = String(body.account || "").trim();
  const email = String(body.email || "").trim();

  if (!name && !contactName && !bizRegNo && !mobile && !bankName && !account && !email) {
    return NextResponse.json({ error: "상호 등 하나 이상은 입력해주세요." }, { status: 400 });
  }

  const vendor = await prisma.equipmentVendor.create({
    data: { name, contactName, bizRegNo, mobile, bankName, account, email },
  });
  return NextResponse.json(vendor);
}
