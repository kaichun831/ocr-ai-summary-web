import { NextResponse } from "next/server";
import {
  applyUserPromptTemplate,
  DEFAULT_SUMMARY_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_USER_PROMPT_TEMPLATE,
} from "@/lib/summary-config";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function createFallbackResponse(text: string, reason: string) {
  return {
    provider: "Local fallback",
    summary: createFallbackSummary(text),
    fallbackReason: reason,
  };
}

function normalizeMarkdownSummary(summary: string) {
  const trimmed = summary.trim();

  if (!trimmed) {
    return "# 摘要\n\n沒有可供輸出的內容。";
  }

  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  return `# 摘要\n\n${trimmed}`;
}

function createFallbackSummary(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "# 摘要\n\n沒有可供彙總的文字內容。";
  }

  const sentences = normalized
    .split(/(?<=[。！？.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const preview = sentences.slice(0, 3);
  const content = preview.length > 0 ? preview.join("\n") : normalized.slice(0, 240);

  return `# 摘要\n\n## 重點\n\n- ${content.replace(/\n/g, "\n- ")}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: string;
    model?: string;
    systemPrompt?: string;
    userPromptTemplate?: string;
  };
  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json(
      { error: "缺少要彙總的文字內容。" },
      { status: 400 },
    );
  }

  const apiKey =
    process.env.GITHUB_MODELS_TOKEN || process.env.COPILOT_API_KEY;
  const apiUrl =
    process.env.GITHUB_MODELS_ENDPOINT ||
    process.env.COPILOT_API_URL ||
    "https://models.github.ai/inference/chat/completions";
  const model =
    body.model?.trim() ||
    process.env.GITHUB_MODELS_MODEL ||
    process.env.COPILOT_MODEL ||
    DEFAULT_SUMMARY_MODEL;
  const systemPrompt = body.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const userPrompt = applyUserPromptTemplate(
    body.userPromptTemplate?.trim() || DEFAULT_USER_PROMPT_TEMPLATE,
    text,
  );

  if (!apiKey) {
    return NextResponse.json(
      createFallbackResponse(text, "未設定 GitHub Models token。"),
    );
  }

  let response: Response;

  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      createFallbackResponse(text, "無法連線到 GitHub Models API。"),
    );
  }

  if (!response.ok) {
    const responseText = await response.text();
    const reason = response.status === 401 || response.status === 403
      ? `GitHub Models API 拒絕存取（HTTP ${response.status}）。請確認 token 權限含 models:read，且帳號可使用 GitHub Models。`
      : `GitHub Models API 呼叫失敗（HTTP ${response.status}）。${responseText.trim() || ""}`.trim();

    return NextResponse.json(createFallbackResponse(text, reason));
  }

  const result = (await response.json()) as ChatCompletionResponse;
  const summary = result.choices?.[0]?.message?.content?.trim();

  if (!summary) {
    return NextResponse.json(
      createFallbackResponse(text, "GitHub Models API 沒有回傳可用的摘要內容。"),
    );
  }

  return NextResponse.json({
    provider: model,
    summary: normalizeMarkdownSummary(summary),
  });
}