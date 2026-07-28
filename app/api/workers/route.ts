import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const workers = await prisma.worker.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  return NextResponse.json(workers);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  const jobType = String(body.jobType || "").trim();
  const idFront = String(body.idFront || "").trim();
  const phone = String(body.phone || "").trim();
  const bankName = String(body.bankName || "").trim();
  const account = String(body.account || "").trim();

  // 이름·주민번호 등 중 하나라도 입력돼 있으면 등록 가능 — 동명이인은 주민번호로 구분한다.
  if (!name && !jobType && !idFront && !phone && !bankName && !account) {
    return NextResponse.json({ error: "이름·주민번호 등 하나 이상은 입력해주세요." }, { status: 400 });
  }

  const worker = await prisma.worker.create({
    data: { name, jobType, idFront, phone, bankName, account },
  });
  return NextResponse.json(worker);
}
