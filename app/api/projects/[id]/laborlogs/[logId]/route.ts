import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  const body = await req.json();
  const type = String(body.type || "");
  const isLaborType = type === "인력" || type === "장비";
  const qty = Number(body.qty) || 0;
  const rate = Number(body.rate) || 0;
  const amount = isLaborType ? qty * rate : Number(body.amount) || 0;

  const log = await prisma.laborLog.update({
    where: { id: params.logId },
    data: {
      type,
      jobType: (type === "인력" || type === "장비") ? String(body.jobType || "").trim() : "",
      name: String(body.name || "").trim(),
      qty,
      unit: String(body.unit || "").trim(),
      rate,
      amount,
      date: body.date || "",
      note: String(body.note || "").trim(),
      vendor: String(body.vendor || "").trim(),
      taxInvoice: (type === "자재" || type === "운반비" || type === "잡자재") ? Boolean(body.taxInvoice) : false,
      workItemId: body.workItemId || null,
    },
  });
  return NextResponse.json(log);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  await prisma.laborLog.delete({ where: { id: params.logId } });
  return NextResponse.json({ ok: true });
}
