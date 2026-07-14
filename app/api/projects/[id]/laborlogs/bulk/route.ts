import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface BulkEntry {
  type: string;
  jobType?: string;
  name: string;
  qty?: number;
  unit?: string;
  rate?: number;
  amount?: number;
  date?: string;
  note?: string;
  taxInvoice?: boolean;
  workItemId?: string | null;
}

// Saves a batch of labor/equipment log entries in one transaction — used by
// the "작업일보 붙여넣기" (paste daily report) import flow after the user has
// reviewed/edited the parsed preview.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const entries: BulkEntry[] = Array.isArray(body.entries) ? body.entries : [];

  const cleaned = entries
    .map((e) => {
      const type = String(e.type || "");
      const isLaborType = type === "인력" || type === "장비";
      const qty = Number(e.qty) || 0;
      const rate = Number(e.rate) || 0;
      const amount = isLaborType ? qty * rate : Number(e.amount) || 0;
      return {
        projectId: params.id,
        type,
        jobType: type === "인력" ? String(e.jobType || "").trim() : "",
        name: String(e.name || "").trim(),
        qty,
        unit: String(e.unit || "").trim(),
        rate,
        amount,
        date: e.date || "",
        note: String(e.note || "").trim(),
        taxInvoice: type === "자재" || type === "운반비" || type === "잡자재" ? Boolean(e.taxInvoice) : false,
        workItemId: e.workItemId || null,
      };
    })
    .filter((e) => e.name && (e.qty > 0 || e.amount > 0));

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "저장할 항목이 없어요." }, { status: 400 });
  }

  const created = await prisma.$transaction(cleaned.map((data) => prisma.laborLog.create({ data })));

  return NextResponse.json(created);
}
