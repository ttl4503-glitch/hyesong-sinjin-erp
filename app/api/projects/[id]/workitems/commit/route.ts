import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface CommitItem {
  name: string;
  spec?: string;
  unit?: string;
  qty?: number;
  unitPrice?: number;
  amount: number;
}

// Saves a (possibly user-edited) BOQ item list that was previously produced
// by POST /workitems/parse. Replaces any existing work items on the project.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const items: CommitItem[] = Array.isArray(body.items) ? body.items : [];
  const fileName: string = body.fileName || "";

  const cleaned = items
    .map((it) => ({
      name: String(it.name || "").trim(),
      spec: String(it.spec || "").trim(),
      unit: String(it.unit || "").trim(),
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      amount: Number(it.amount) || 0,
    }))
    .filter((it) => it.name && it.amount > 0);

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "저장할 공종 항목이 없어요." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const total = cleaned.reduce((s, it) => s + it.amount, 0);

  await prisma.workItem.deleteMany({ where: { projectId: params.id } });
  await prisma.workItem.createMany({
    data: cleaned.map((it) => ({ ...it, projectId: params.id })),
  });

  const updateData: Record<string, unknown> = {
    workItemsTotal: total,
    workItemsFileName: fileName,
  };
  if (!project.contractAmount || project.contractAmount <= 0) {
    updateData.contractAmount = total;
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: updateData,
    include: { milestones: true, laborLogs: { include: { receipt: { select: { id: true } } } }, workItems: true, dailyNotes: true },
  });

  return NextResponse.json(updated);
}
