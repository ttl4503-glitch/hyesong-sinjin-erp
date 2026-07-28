import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// 클라이언트가 보내는 x-user-id 헤더로 현재 로그인 사용자를 서버에서 확인합니다.
// <a href> 다운로드 링크(집계 엑셀 등)는 브라우저 네비게이션이라 커스텀 헤더를 실어
// 보낼 수 없으므로, 그런 곳에서는 ?uid= 쿼리스트링으로 넘어온 값도 함께 확인한다.
export async function getReqUser(req: NextRequest) {
  const id = req.headers.get("x-user-id") || new URL(req.url).searchParams.get("uid");
  if (!id) return null;
  try {
    const u = await prisma.appUser.findUnique({ where: { id } });
    return u && !u.deletedAt ? u : null;
  } catch {
    return null;
  }
}

// 관리자만 통과. 관리자가 아니면 null.
export async function requireAdmin(req: NextRequest) {
  const u = await getReqUser(req);
  return u && u.isAdmin ? u : null;
}
