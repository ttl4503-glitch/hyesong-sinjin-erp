import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authServer";

// 관리자 전용 휴지통: 삭제된 공사/인원/사용자/작업일보 항목을 모아 보여주고 복구합니다.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });

  const [projects, workers, users, laborLogs, receipts] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.worker.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.appUser.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.laborLog.findMany({
      where: { deletedAt: { not: null } },
      include: { project: { select: { name: true, company: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    prisma.receipt.findMany({
      where: { deletedAt: { not: null } },
      include: { laborLog: { include: { project: { select: { name: true, company: true } } } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
  ]);

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      company: p.company,
      name: p.name,
      location: p.location,
      deletedAt: p.deletedAt,
    })),
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      jobType: w.jobType,
      idFront: w.idFront,
      deletedAt: w.deletedAt,
    })),
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      isAdmin: u.isAdmin,
      deletedAt: u.deletedAt,
    })),
    laborLogs: laborLogs.map((l) => ({
      id: l.id,
      projectId: l.projectId,
      projectName: l.project?.name || "",
      company: l.project?.company || "",
      type: l.type,
      name: l.name,
      date: l.date,
      amount: l.amount,
      deletedAt: l.deletedAt,
    })),
    receipts: receipts.map((r) => ({
      id: r.id,
      laborLogId: r.laborLogId,
      projectName: r.laborLog?.project?.name || "",
      company: r.laborLog?.project?.company || "",
      type: r.laborLog?.type || "",
      name: r.laborLog?.name || "",
      date: r.laborLog?.date || "",
      imageData: r.imageData,
      deletedAt: r.deletedAt,
    })),
  });
}

// 복구: { type: "project"|"worker"|"user"|"laborlog", id }
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자만 접근할 수 있어요." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const type = String(body.type || "");
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "대상을 확인할 수 없어요." }, { status: 400 });

  try {
    if (type === "project") {
      await prisma.project.update({ where: { id }, data: { deletedAt: null } });
    } else if (type === "worker") {
      await prisma.worker.update({ where: { id }, data: { deletedAt: null } });
    } else if (type === "user") {
      await prisma.appUser.update({ where: { id }, data: { deletedAt: null } });
    } else if (type === "laborlog") {
      await prisma.laborLog.update({ where: { id }, data: { deletedAt: null } });
    } else if (type === "receipt") {
      await prisma.receipt.update({ where: { id }, data: { deletedAt: null } });
    } else {
      return NextResponse.json({ error: "알 수 없는 항목 유형이에요." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "복구 중 오류가 발생했어요. 이미 영구적으로 지워졌을 수 있어요." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
