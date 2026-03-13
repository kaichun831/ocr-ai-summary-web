import { NextResponse } from "next/server";

type OcrSpaceSuccessResponse = {
  IsErroredOnProcessing: boolean;
  ParsedResults?: Array<{
    ParsedText?: string;
  }>;
  ErrorMessage?: string[];
  ErrorDetails?: string;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: "缺少上傳圖片。" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OCR_SPACE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "尚未設定 OCR_SPACE_API_KEY。" },
      { status: 503 },
    );
  }

  const upstreamFormData = new FormData();
  upstreamFormData.append(
    "file",
    new Blob([await image.arrayBuffer()], { type: image.type }),
    image.name,
  );
  upstreamFormData.append("language", process.env.OCR_SPACE_LANGUAGE || "eng");
  upstreamFormData.append("isOverlayRequired", "false");
  upstreamFormData.append("isTable", "true");
  upstreamFormData.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: apiKey,
    },
    body: upstreamFormData,
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "OCR 服務暫時不可用。" },
      { status: 502 },
    );
  }

  const result = (await response.json()) as OcrSpaceSuccessResponse;
  const text = result.ParsedResults?.map((item) => item.ParsedText?.trim() || "")
    .filter(Boolean)
    .join("\n\n");

  if (result.IsErroredOnProcessing || !text) {
    const errorMessage =
      result.ErrorMessage?.join(" ") ||
      result.ErrorDetails ||
      "OCR 無法辨識文字。";

    return NextResponse.json({ error: errorMessage }, { status: 422 });
  }

  return NextResponse.json({
    provider: "OCR.space",
    text,
  });
}