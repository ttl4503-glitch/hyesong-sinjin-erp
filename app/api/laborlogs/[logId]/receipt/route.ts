import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB base64 data URL (client compresses before upload)

export async function GET(_req: NextRequest, { params }: { params: { logId: string } }) {
  const receipt = await prisma.receipt.findUnique({ where: { laborLogId: params.logId } });
  if (!receipt) return NextResponse.json({ error: "영수증이 없어요." }, { status: 404 });
  return NextResponse.json({ imageData: receipt.imageData });
}

export async function POST(req: NextRequest, { params }: { params: { logId: string } }) {
  const body = await req.json();
  const imageData = String(body.imageData || "");
  if (!imageData.startsWith("data:image/")) {
    return NextResponse.json({ error: "이미지 형식이 아니에요." }, { status: 400 });
  }
  if (imageData.length > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "이미지 용량이 너무 커요." }, { status: 400 });
  }

  const receipt = await prisma.receipt.upsert({
    where: { laborLogId: params.logId },
    update: { imageData },
    create: { laborLogId: params.logId, imageData },
  });
  return NextResponse.json({ id: receipt.id });
}

export async function DELETE(_req: NextRequest, { params }: { params: { logId: string } }) {
  await prisma.receipt.deleteMany({ where: { laborLogId: params.logId } });
  return NextResponse.json({ ok: true });
}
