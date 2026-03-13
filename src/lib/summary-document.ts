import { createDefaultSummaryConfig, SummaryConfig } from "@/lib/summary-config";

export const SUMMARY_STORAGE_KEY = "ocr-copilot-summary-document";

export type SummaryProviderDetails = {
  modeLabel: string;
  badgeLabel: string;
  description: string;
  isFallback: boolean;
};

export type SummaryDocument = {
  title: string;
  summaryMarkdown: string;
  ocrText: string;
  provider: string;
  fallbackReason?: string;
  createdAt: string;
  sourceFiles: string[];
  summaryConfig: SummaryConfig;
};

export function getSummaryProviderDetails(provider: string, fallbackReason?: string): SummaryProviderDetails {
  const normalizedProvider = provider.trim();

  if (!normalizedProvider) {
    return {
      modeLabel: "未標記",
      badgeLabel: "未標記",
      description: "尚未記錄摘要模式。",
      isFallback: false,
    };
  }

  if (normalizedProvider === "Local fallback") {
    return {
      modeLabel: "簡易摘要模式",
      badgeLabel: "簡易摘要",
      description:
        fallbackReason?.trim() ||
        "GitHub Models 無法使用，系統改用本地 fallback 規則整理內容。",
      isFallback: true,
    };
  }

  return {
    modeLabel: "AI 摘要模式",
    badgeLabel: normalizedProvider,
    description: `已使用 ${normalizedProvider} 產生 AI 摘要。`,
    isFallback: false,
  };
}

function sanitizeFilenamePart(value: string) {
  const cleaned = value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();

  return cleaned || "ocr-summary";
}

export function createDocumentBaseName(sourceFiles: string[]) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const leadName = sourceFiles[0] ? sanitizeFilenamePart(sourceFiles[0]) : "ocr-summary";
  return `${leadName}-${timestamp}`;
}

export function createSummaryFilename(sourceFiles: string[]) {
  return `${createDocumentBaseName(sourceFiles)}-summary.md`;
}

export function createReportFilename(sourceFiles: string[]) {
  return `${createDocumentBaseName(sourceFiles)}-report.md`;
}

export function buildSummaryDocument(params: {
  summaryMarkdown: string;
  ocrText: string;
  provider: string;
  fallbackReason?: string;
  sourceFiles: string[];
  summaryConfig: SummaryConfig;
}) {
  return {
    title: params.sourceFiles[0]
      ? `OCR 摘要 - ${params.sourceFiles[0]}`
      : "OCR 摘要",
    summaryMarkdown: params.summaryMarkdown,
    ocrText: params.ocrText,
    provider: params.provider,
    fallbackReason: params.fallbackReason,
    createdAt: new Date().toISOString(),
    sourceFiles: params.sourceFiles,
    summaryConfig: params.summaryConfig,
  } satisfies SummaryDocument;
}

export function buildReportMarkdown(document: SummaryDocument) {
  const providerDetails = getSummaryProviderDetails(
    document.provider,
    document.fallbackReason,
  );
  const sourceFileList = document.sourceFiles.length > 0
    ? document.sourceFiles.map((file) => `- ${file}`).join("\n")
    : "- 未記錄來源檔名";

  return [
    `# ${document.title}`,
    "",
    "## 文件資訊",
    "",
    `- 產生時間：${document.createdAt}`,
    `- 摘要模式：${providerDetails.modeLabel}`,
    `- 摘要模型：${document.provider || "未標記"}`,
    `- 模式說明：${providerDetails.description}`,
    "- 摘要來源：所有 OCR 辨識結果合併後，一次送往 API 彙總",
    "",
    "## 摘要設定",
    "",
    `- 模型：${document.summaryConfig.model}`,
    "",
    "### System Prompt",
    "",
    "```text",
    document.summaryConfig.systemPrompt.trim() || "未設定",
    "```",
    "",
    "### User Prompt Template",
    "",
    "```text",
    document.summaryConfig.userPromptTemplate.trim() || "未設定",
    "```",
    "",
    "## 來源圖片",
    "",
    sourceFileList,
    "",
    "## 摘要",
    "",
    document.summaryMarkdown,
    "",
    "## OCR 原文",
    "",
    "```text",
    document.ocrText.trim() || "沒有 OCR 原文。",
    "```",
  ].join("\n");
}

export function parseStoredSummaryDocument(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SummaryDocument;
    if (typeof parsed.summaryMarkdown === "string") {
      return {
        ...parsed,
        summaryConfig: {
          model:
            parsed.summaryConfig?.model?.trim() || createDefaultSummaryConfig().model,
          systemPrompt:
            parsed.summaryConfig?.systemPrompt?.trim() ||
            createDefaultSummaryConfig().systemPrompt,
          userPromptTemplate:
            parsed.summaryConfig?.userPromptTemplate?.trim() ||
            createDefaultSummaryConfig().userPromptTemplate,
        },
      } satisfies SummaryDocument;
    }
  } catch {
    return {
      title: "OCR 摘要",
      summaryMarkdown: raw,
      ocrText: "",
      provider: "",
      fallbackReason: undefined,
      createdAt: new Date().toISOString(),
      sourceFiles: [],
      summaryConfig: createDefaultSummaryConfig(),
    } satisfies SummaryDocument;
  }

  return null;
}