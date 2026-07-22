import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const type = String(body.type || "");
  const isLaborType = type === "인력" || type === "장비";
  const qty = Number(body.qty) || 0;
  const rate = Number(body.rate) || 0;
  const amount = isLaborType ? qty * rate : Number(body.amount) || 0;

  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "이름/항목명을 입력해주세요." }, { status: 400 });
  }
  if (qty <= 0 && amount <= 0) {
    return NextResponse.json(
      { error: "공수(수량) 또는 금액 중 하나는 입력해주세요." },
      { status: 400 }
    );
  }

  const log = await prisma.laborLog.create({
    data: {
      projectId: params.id,
      type,
      jobType: (type === "인력" || type === "장비") ? String(body.jobType || "").trim() : "",
      name: String(body.name).trim(),
      qty,
      unit: String(body.unit || "").trim(),
      rate,
      amount,
      date: body.date || "",
      note: String(body.note || "").trim(),
      vendor: String(body.vendor || "").trim(),
      taxInvoice: (type === "장비" || type === "자재" || type === "운반비" || type === "잡자재") ? Boolean(body.taxInvoice) : false,
      workItemId: body.workItemId || null,
    },
  });
  return NextResponse.json(log);
}
