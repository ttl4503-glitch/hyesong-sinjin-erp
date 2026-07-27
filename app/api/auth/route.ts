import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 로그인 화면용 상태: 사용자가 한 명이라도 있는지, 이름 목록(드롭다운용)
export async function GET() {
  const users = await prisma.appUser.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    hasUsers: users.length > 0,
    names: users.map((u) => u.name),
  });
}

// action=bootstrap : 최초 1회 관리자 계정 생성 (사용자가 아무도 없을 때만)
// action=login     : 이름 + 4자리 PIN 로그인
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const name = String(body.name || "").trim();
  const pin = String(body.pin || "").trim();

  if (action === "bootstrap") {
    const count = await prisma.appUser.count();
    if (count > 0) {
      return NextResponse.json({ error: "이미 관리자 계정이 있어요. 관리자에게 계정을 요청하세요." }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해주세요." }, { status: 400 });
    const u = await prisma.appUser.create({ data: { name, pin, isAdmin: true, projectIds: [] } });
    return NextResponse.json({ user: { id: u.id, name: u.name, isAdmin: u.isAdmin, projectIds: u.projectIds } });
  }

  // login
  if (!name || !pin) return NextResponse.json({ error: "이름과 비밀번호를 입력해주세요." }, { status: 400 });
  const u = await prisma.appUser.findUnique({ where: { name } });
  if (!u || u.pin !== pin) {
    return NextResponse.json({ error: "이름 또는 비밀번호가 올바르지 않아요." }, { status: 401 });
  }
  return NextResponse.json({ user: { id: u.id, name: u.name, isAdmin: u.isAdmin, projectIds: u.projectIds } });
}
