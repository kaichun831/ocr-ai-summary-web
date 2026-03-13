export const DEFAULT_SUMMARY_MODEL = "openai/gpt-4.1-mini";

export const DEFAULT_SYSTEM_PROMPT =
  "你是文件摘要助手。請使用繁體中文輸出，保留最重要的事實、數字、日期與行動項目，避免虛構內容。輸出必須是乾淨的 Markdown，至少包含一個一級標題與一個重點條列清單。";

export const DEFAULT_USER_PROMPT_TEMPLATE =
  "請將以下 OCR 內容整理成 Markdown 摘要。格式要求：\n1. 第一行必須是 # 標題\n2. 內文使用 ## 小節\n3. 至少提供一段條列重點\n4. 不要輸出程式碼區塊\n\nOCR 內容如下：\n\n{{text}}";

export type SummaryConfig = {
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

export function createDefaultSummaryConfig() {
  return {
    model: DEFAULT_SUMMARY_MODEL,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_USER_PROMPT_TEMPLATE,
  } satisfies SummaryConfig;
}

export function applyUserPromptTemplate(template: string, text: string) {
  if (!template.includes("{{text}}")) {
    return `${template.trim()}\n\n${text}`.trim();
  }

  return template.replaceAll("{{text}}", text);
}