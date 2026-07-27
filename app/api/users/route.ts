import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

// 관리자만: 사용자 목록 (PIN 포함 — 관리자가 직원에게 비번을 알려줄 수 있게)
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const users = await prisma.appUser.findMany({ orderBy: [{ isAdmin: "desc" }, { name: "asc" }] });
  return NextResponse.json(
    users.map((u) => ({ id: u.id, name: u.name, pin: u.pin, isAdmin: u.isAdmin, projectIds: u.projectIds }))
  );
}

// 관리자만: 사용자 생성
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const pin = String(body.pin || "").trim();
  const isAdmin = !!body.isAdmin;
  const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map(String) : [];
  if (!name) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해주세요." }, { status: 400 });
  const dup = await prisma.appUser.findUnique({ where: { name } });
  if (dup) return NextResponse.json({ error: "이미 같은 이름의 사용자가 있어요." }, { status: 400 });
  const u = await prisma.appUser.create({ data: { name, pin, isAdmin, projectIds: isAdmin ? [] : projectIds } });
  return NextResponse.json({ id: u.id, name: u.name, pin: u.pin, isAdmin: u.isAdmin, projectIds: u.projectIds });
}
