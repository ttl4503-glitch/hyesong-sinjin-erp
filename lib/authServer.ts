import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// 클라이언트가 보내는 x-user-id 헤더로 현재 로그인 사용자를 서버에서 확인합니다.
export async function getReqUser(req: NextRequest) {
  const id = req.headers.get("x-user-id");
  if (!id) return null;
  try {
    return await prisma.appUser.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

// 관리자만 통과. 관리자가 아니면 null.
export async function requireAdmin(req: NextRequest) {
  const u = await getReqUser(req);
  return u && u.isAdmin ? u : null;
}
