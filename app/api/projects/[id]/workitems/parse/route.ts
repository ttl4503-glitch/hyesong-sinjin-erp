import { NextRequest, NextResponse } from "next/server";
import { parseWorkItemsBuffer } from "@/lib/parseWorkItems";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Parses an uploaded BOQ file and returns the result WITHOUT touching the
// database — the client shows an editable preview and only commits
// (POST /workitems/commit) once the user confirms.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "파일을 선택해주세요." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "파일 크기는 5MB 이하만 업로드할 수 있어요." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  let parsed;
  try {
    parsed = parseWorkItemsBuffer(buf);
  } catch {
    return NextResponse.json({ error: "엑셀 파일을 읽는 중 문제가 발생했어요." }, { status: 400 });
  }
  if (parsed.items.length === 0) {
    return NextResponse.json(
      { error: "엑셀에서 공종 항목을 찾지 못했어요. 공종·수량·단가·금액이 포함된 표 형식인지 확인해주세요." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    items: parsed.items,
    total: parsed.total,
    fileName: `${file.name} (${parsed.sheetName} 시트)`,
  });
}
