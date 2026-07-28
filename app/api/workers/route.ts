import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const workers = await prisma.worker.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(workers);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });

  const existing = await prisma.worker.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "이미 등록된 이름이에요. 수정은 목록에서 해주세요." }, { status: 400 });
  }

  const worker = await prisma.worker.create({
    data: {
      name,
      jobType: String(body.jobType || "").trim(),
      idFront: String(body.idFront || "").trim(),
      bankName: String(body.bankName || "").trim(),
      account: String(body.account || "").trim(),
    },
  });
  return NextResponse.json(worker);
}
