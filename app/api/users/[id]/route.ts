import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReqUser, requireAdmin } from "@/lib/authServer";

// 관리자: 사용자 정보 전체 수정 (이름/PIN/관리자여부/담당현장)
// 본인: 로그인 후 자기 비밀번호만 변경 가능 (현재 비밀번호 확인 필요)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const reqUser = await getReqUser(req);
  const isAdmin = !!reqUser?.isAdmin;
  const isSelf = reqUser?.id === params.id;
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (!isAdmin) {
    // 본인 비밀번호 변경: 현재 비밀번호 확인 후 PIN만 변경 가능
    if (!/^\d{4}$/.test(String(body.pin || "").trim())) {
      return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해주세요." }, { status: 400 });
    }
    const target = await prisma.appUser.findUnique({ where: { id: params.id } });
    if (!target || target.pin !== String(body.currentPin || "").trim()) {
      return NextResponse.json({ error: "현재 비밀번호가 올바르지 않아요." }, { status: 400 });
    }
    const u = await prisma.appUser.update({ where: { id: params.id }, data: { pin: body.pin.trim() } });
    return NextResponse.json({ id: u.id, name: u.name, pin: u.pin, isAdmin: u.isAdmin, projectIds: u.projectIds });
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });
    const dup = await prisma.appUser.findUnique({ where: { name } });
    if (dup && dup.id !== params.id) {
      return NextResponse.json({ error: "이미 같은 이름의 사용자가 있어요." }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.pin === "string" && body.pin.trim()) {
    if (!/^\d{4}$/.test(body.pin.trim())) {
      return NextResponse.json({ error: "비밀번호는 숫자 4자리로 입력해주세요." }, { status: 400 });
    }
    data.pin = body.pin.trim();
  }
  if (typeof body.isAdmin === "boolean") data.isAdmin = body.isAdmin;
  if (Array.isArray(body.projectIds)) data.projectIds = body.projectIds.map(String);
  // 관리자로 지정하면 담당현장 제한은 의미가 없어 비워둡니다.
  if (data.isAdmin === true) data.projectIds = [];

  const u = await prisma.appUser.update({ where: { id: params.id }, data: data as any });
  return NextResponse.json({ id: u.id, name: u.name, pin: u.pin, isAdmin: u.isAdmin, projectIds: u.projectIds });
}

// 관리자만: 사용자 삭제 (마지막 관리자는 삭제 불가)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });
  const target = await prisma.appUser.findUnique({ where: { id: params.id } });
  if (target?.isAdmin) {
    const adminCount = await prisma.appUser.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "마지막 관리자는 삭제할 수 없어요." }, { status: 400 });
    }
  }
  await prisma.appUser.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
