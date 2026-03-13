"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildReportMarkdown,
  buildSummaryDocument,
  createReportFilename,
  createSummaryFilename,
  SUMMARY_STORAGE_KEY,
} from "@/lib/summary-document";
import {
  createDefaultSummaryConfig,
  SummaryConfig,
} from "@/lib/summary-config";

type RequestState = "idle" | "compressing" | "uploading" | "summarizing";

type UploadStatus =
  | "queued"
  | "compressing"
  | "ready"
  | "processing"
  | "done"
  | "error";

type UploadItem = {
  id: string;
  name: string;
  originalSize: number;
  compressedSize: number;
  previewUrl: string;
  file: File;
  status: UploadStatus;
  extractedText: string;
  error: string;
};

type OcrResponse = {
  provider?: string;
  text?: string;
  error?: string;
};

type SummaryResponse = {
  provider?: string;
  summary?: string;
  error?: string;
};

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const TARGET_FILE_SIZE = 950 * 1024;
const MAX_DIMENSION = 2200;
const SUMMARY_CONFIG_STORAGE_KEY = "ocr-copilot-summary-config";

function getStatusLabel(status: UploadStatus) {
  switch (status) {
    case "queued":
      return "待處理";
    case "compressing":
      return "壓縮中";
    case "ready":
      return "待 OCR";
    case "processing":
      return "辨識中";
    case "done":
      return "完成";
    case "error":
      return "失敗";
  }
}

function getStatusTone(status: UploadStatus) {
  switch (status) {
    case "done":
      return "bg-emerald-100 text-emerald-700";
    case "error":
      return "bg-rose-100 text-rose-700";
    case "processing":
    case "compressing":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error(`無法讀取圖片：${file.name}`));
    };

    image.src = imageUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("圖片壓縮失敗。"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function compressImage(file: File) {
  if (file.size <= TARGET_FILE_SIZE) {
    return file;
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("目前瀏覽器不支援圖片壓縮。");
  }

  let width = image.width;
  let height = image.height;
  const longestEdge = Math.max(width, height);

  if (longestEdge > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longestEdge;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  let quality = 0.88;
  let attempt = 0;
  let currentWidth = width;
  let currentHeight = height;
  let blob: Blob | null = null;

  while (attempt < 6) {
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    context.clearRect(0, 0, currentWidth, currentHeight);
    context.drawImage(image, 0, 0, currentWidth, currentHeight);

    blob = await canvasToBlob(canvas, quality);

    if (blob.size <= TARGET_FILE_SIZE) {
      break;
    }

    quality -= 0.12;
    if (quality < 0.45) {
      quality = 0.72;
      currentWidth = Math.max(800, Math.round(currentWidth * 0.82));
      currentHeight = Math.max(800, Math.round(currentHeight * 0.82));
    }

    attempt += 1;
  }

  if (!blob) {
    throw new Error("圖片壓縮失敗。");
  }

  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + ".jpg",
    {
      type: "image/jpeg",
      lastModified: Date.now(),
    },
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [ocrProvider, setOcrProvider] = useState("");
  const [summaryProvider, setSummaryProvider] = useState("");
  const [queueProgress, setQueueProgress] = useState("尚未開始");
  const previewUrlsRef = useRef<string[]>([]);
  const [summaryConfig, setSummaryConfig] = useState<SummaryConfig>(() => {
    if (typeof window === "undefined") {
      return createDefaultSummaryConfig();
    }

    const storedValue = window.localStorage.getItem(SUMMARY_CONFIG_STORAGE_KEY);

    if (!storedValue) {
      return createDefaultSummaryConfig();
    }

    try {
      const parsed = JSON.parse(storedValue) as Partial<SummaryConfig>;

      return {
        model: parsed.model?.trim() || createDefaultSummaryConfig().model,
        systemPrompt:
          parsed.systemPrompt?.trim() || createDefaultSummaryConfig().systemPrompt,
        userPromptTemplate:
          parsed.userPromptTemplate?.trim() ||
          createDefaultSummaryConfig().userPromptTemplate,
      } satisfies SummaryConfig;
    } catch {
      return createDefaultSummaryConfig();
    }
  });

  const canRunOcr = uploadItems.length > 0 && status === "idle";
  const canSummarize = Boolean(ocrText.trim()) && status === "idle";

  const fileDetails = useMemo(() => {
    if (uploadItems.length === 0) {
      return "尚未選取圖片";
    }

    const totalSize = uploadItems.reduce(
      (total, item) => total + item.originalSize,
      0,
    );

    return `${uploadItems.length} 張圖片 · 原始總大小 ${formatFileSize(totalSize)}`;
  }, [uploadItems]);

  const sourceFileNames = useMemo(
    () => uploadItems.map((item) => item.name),
    [uploadItems],
  );

  useEffect(() => {
    previewUrlsRef.current = uploadItems.map((item) => item.previewUrl);
  }, [uploadItems]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SUMMARY_CONFIG_STORAGE_KEY,
      JSON.stringify(summaryConfig),
    );
  }, [summaryConfig]);

  function updateSummaryConfig<K extends keyof SummaryConfig>(
    key: K,
    value: SummaryConfig[K],
  ) {
    setSummaryConfig((currentConfig) => ({
      ...currentConfig,
      [key]: value,
    }));
  }

  function updateUploadItem(id: string, updater: (item: UploadItem) => UploadItem) {
    setUploadItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? updater(item) : item)),
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setErrorMessage("");
    setQueueProgress("尚未開始");
    setSummary("");
    setSummaryProvider("");
    setOcrText("");
    setOcrProvider("");

    uploadItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));

    if (files.length === 0) {
      setUploadItems([]);
      return;
    }

    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    const oversizedFiles = validFiles.filter((file) => file.size > MAX_FILE_SIZE);
    const acceptedFiles = validFiles.filter((file) => file.size <= MAX_FILE_SIZE);

    if (validFiles.length !== files.length) {
      setErrorMessage("已略過非圖片檔案，只接受 PNG、JPG 或 WebP。");
    }

    if (oversizedFiles.length > 0) {
      setErrorMessage(
        `${oversizedFiles.length} 張圖片超過 12MB，已略過。其餘圖片會保留。`,
      );
    }

    setUploadItems(
      acceptedFiles.map((file, index) => ({
        id: `${file.name}-${file.size}-${index}`,
        name: file.name,
        originalSize: file.size,
        compressedSize: file.size,
        previewUrl: URL.createObjectURL(file),
        file,
        status: "queued",
        extractedText: "",
        error: "",
      })),
    );
  }

  async function requestSummary(text: string) {
    const response = await fetch("/api/summarize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model: summaryConfig.model,
        systemPrompt: summaryConfig.systemPrompt,
        userPromptTemplate: summaryConfig.userPromptTemplate,
      }),
    });

    const data = (await response.json()) as SummaryResponse;

    if (!response.ok || !data.summary) {
      throw new Error(data.error || "彙總失敗，請稍後再試。");
    }

    setSummary(data.summary);
    const provider = data.provider || "GitHub Models";
    setSummaryProvider(provider);

    const summaryDocument = buildSummaryDocument({
      summaryMarkdown: data.summary,
      ocrText: text,
      provider,
      sourceFiles: sourceFileNames,
      summaryConfig,
    });

    window.localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(summaryDocument));
  }

  function syncSummaryDocument(summaryMarkdown: string, provider = summaryProvider) {
    const summaryDocument = buildSummaryDocument({
      summaryMarkdown,
      ocrText,
      provider,
      sourceFiles: sourceFileNames,
      summaryConfig,
    });

    window.localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(summaryDocument));

    return summaryDocument;
  }

  function handleOpenSummaryPreview() {
    if (!summary.trim()) {
      return;
    }

    syncSummaryDocument(summary);
    window.open("/summary-preview", "_blank", "noopener,noreferrer");
  }

  function handleDownloadSummary() {
    if (!summary.trim()) {
      return;
    }

    const summaryDocument = syncSummaryDocument(summary);
    const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = createSummaryFilename(summaryDocument.sourceFiles);
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  function handleDownloadReport() {
    if (!summary.trim()) {
      return;
    }

    const summaryDocument = syncSummaryDocument(summary);
    const reportMarkdown = buildReportMarkdown(summaryDocument);
    const blob = new Blob([reportMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = createReportFilename(summaryDocument.sourceFiles);
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  async function handleOcr() {
    if (uploadItems.length === 0) {
      return;
    }

    setStatus("compressing");
    setErrorMessage("");
    setSummary("");
    setSummaryProvider("");
    setQueueProgress(`準備處理 ${uploadItems.length} 張圖片`);

    const aggregatedTexts: string[] = [];
    const failedItems: string[] = [];

    try {
      for (let index = 0; index < uploadItems.length; index += 1) {
        const item = uploadItems[index];

        setQueueProgress(`壓縮第 ${index + 1} / ${uploadItems.length} 張：${item.name}`);
        updateUploadItem(item.id, (currentItem) => ({
          ...currentItem,
          status: "compressing",
          error: "",
        }));

        let compressedFile: File;

        try {
          compressedFile = await compressImage(item.file);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "圖片壓縮失敗。";
          failedItems.push(`${item.name}：${message}`);
          updateUploadItem(item.id, (currentItem) => ({
            ...currentItem,
            status: "error",
            error: message,
          }));
          continue;
        }

        updateUploadItem(item.id, (currentItem) => ({
          ...currentItem,
          file: compressedFile,
          compressedSize: compressedFile.size,
          status: "ready",
        }));

        setStatus("uploading");
        setQueueProgress(`OCR 第 ${index + 1} / ${uploadItems.length} 張：${item.name}`);
        updateUploadItem(item.id, (currentItem) => ({
          ...currentItem,
          status: "processing",
        }));

        const formData = new FormData();
        formData.append("image", compressedFile);

        const response = await fetch("/api/ocr", {
          method: "POST",
          body: formData,
        });

        const data = (await response.json()) as OcrResponse;

        if (!response.ok || !data.text) {
          const message = data.error || "OCR 失敗，請稍後再試。";
          failedItems.push(`${item.name}：${message}`);
          updateUploadItem(item.id, (currentItem) => ({
            ...currentItem,
            status: "error",
            error: message,
          }));
          continue;
        }

        const fileText = `【${item.name}】\n${data.text.trim()}`;
        aggregatedTexts.push(fileText);
        updateUploadItem(item.id, (currentItem) => ({
          ...currentItem,
          status: "done",
          extractedText: data.text ?? "",
        }));
        setOcrProvider(data.provider || "OCR.space");
      }

      const mergedText = aggregatedTexts.join("\n\n====================\n\n");
      setOcrText(mergedText);

      if (!mergedText) {
        throw new Error(
          failedItems.length > 0
            ? `所有圖片都未成功辨識。${failedItems.join("；")}`
            : "沒有可供彙總的 OCR 文字。",
        );
      }

      setStatus("summarizing");
      setQueueProgress("所有圖片 OCR 完成，開始整批彙總");
      setErrorMessage("所有辨識結果已合併，將只送一次摘要 API。" + (failedItems.length > 0 ? ` 失敗項目：${failedItems.join("；")}` : ""));
      await requestSummary(mergedText);

      if (failedItems.length === 0) {
        setErrorMessage("");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "批次 OCR 失敗，請稍後再試。",
      );
    } finally {
      setQueueProgress((currentProgress) =>
        currentProgress === "所有圖片 OCR 完成，開始整批彙總"
          ? "處理完成"
          : currentProgress,
      );
      setStatus("idle");
    }
  }

  async function handleSummarize() {
    if (!ocrText.trim()) {
      return;
    }

    setStatus("summarizing");
    setErrorMessage("");
    setQueueProgress("使用目前文字重新彙總");

    try {
      await requestSummary(ocrText);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "彙總失敗，請稍後再試。",
      );
    } finally {
      setQueueProgress("處理完成");
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.7),_transparent_28%),linear-gradient(135deg,_#f4efe4_0%,_#c7d8d4_48%,_#7a8ea1_100%)] px-5 py-10 text-slate-950 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/55 bg-white/75 p-8 shadow-[0_24px_80px_rgba(44,62,80,0.18)] backdrop-blur">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
              OCR Workspace
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
              上傳照片，抽取文字，再交給 Copilot 相容 API 做彙總。
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">
              這個頁面提供一條完整流程：多張圖片上傳、前端壓縮、依序 OCR 辨識、合併文字，以及一鍵產出整批摘要。OCR 與摘要都走伺服器路由，方便後續換成你自己的服務憑證。
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-950 px-5 py-4 text-slate-50">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Step 1
                </p>
                <p className="mt-2 text-lg">多圖上傳</p>
              </div>
              <div className="rounded-3xl bg-white px-5 py-4 text-slate-900 ring-1 ring-slate-200">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Step 2
                </p>
                <p className="mt-2 text-lg">壓縮與佇列 OCR</p>
              </div>
              <div className="rounded-3xl bg-[#e7efe6] px-5 py-4 text-slate-900 ring-1 ring-[#c8d8ca]">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Step 3
                </p>
                <p className="mt-2 text-lg">整批一次摘要</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-900/10 bg-slate-950 p-6 text-slate-50 shadow-[0_24px_80px_rgba(23,37,84,0.28)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                  Upload Panel
                </p>
                <h2 className="mt-2 text-2xl font-medium">圖片輸入</h2>
              </div>
              <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-slate-300">
                {status === "idle"
                  ? "待命中"
                  : status === "compressing"
                    ? "壓縮中"
                  : status === "uploading"
                    ? "辨識中"
                    : "彙總中"}
              </span>
            </div>

            <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/20 bg-white/5 px-6 py-10 text-center transition hover:border-[#d7ff7f] hover:bg-white/8">
              <span className="text-sm uppercase tracking-[0.28em] text-slate-400">
                支援 PNG / JPG / WebP
              </span>
              <span className="mt-3 text-2xl font-medium">選取多張照片開始批次處理</span>
              <span className="mt-2 text-sm text-slate-300">每張上限 12MB，送出前會自動壓縮</span>
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/jpg"
                multiple
                onChange={handleFileChange}
              />
            </label>

            <div className="mt-4 rounded-3xl bg-white/6 px-4 py-3 text-sm text-slate-200">
              {fileDetails}
            </div>

            <div className="mt-3 rounded-3xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-300">
              {queueProgress}
            </div>

            {uploadItems.length > 0 ? (
              <div className="mt-4 grid max-h-[24rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {uploadItems.map((item) => (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/20"
                  >
                    <Image
                      alt={item.name}
                      className="h-40 w-full object-cover"
                      height={160}
                      src={item.previewUrl}
                      unoptimized
                      width={320}
                    />
                    <div className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-sm text-slate-100">{item.name}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${getStatusTone(item.status)}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {formatFileSize(item.originalSize)}
                        {item.compressedSize !== item.originalSize
                          ? ` -> ${formatFileSize(item.compressedSize)}`
                          : ""}
                      </p>
                      {item.error ? (
                        <p className="text-xs text-rose-300">{item.error}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="rounded-full bg-[#d7ff7f] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#c6f64c] disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                disabled={!canRunOcr}
                onClick={handleOcr}
                type="button"
              >
                {status === "idle"
                  ? "開始批次 OCR 與摘要"
                  : status === "compressing"
                    ? "圖片壓縮中..."
                    : status === "uploading"
                      ? "OCR 佇列執行中..."
                      : "摘要產生中..."}
              </button>
              <button
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-slate-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                disabled={!canSummarize}
                onClick={handleSummarize}
                type="button"
              >
                {status === "summarizing" ? "摘要產生中..." : "重新彙總文字"}
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-slate-500">
                Summary Controls
              </p>
              <h2 className="mt-2 text-2xl font-medium text-slate-950">
                動態摘要設定
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                這裡可以直接調整摘要模型與 prompt。摘要 API 會使用你目前填入的設定；若 user prompt 沒有放入
                <span className="mx-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                  {"{{text}}"}
                </span>
                ，系統會自動把 OCR 文字附加在後面。批次 OCR 完成後，所有辨識結果仍然會先合併，再只送一次摘要 API。
              </p>
            </div>
            <button
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
              onClick={() => setSummaryConfig(createDefaultSummaryConfig())}
              type="button"
            >
              還原預設
            </button>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <label className="flex flex-col gap-2 lg:col-span-2">
              <span className="text-sm font-medium text-slate-700">模型名稱</span>
              <input
                className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-300/35"
                onChange={(event) => updateSummaryConfig("model", event.target.value)}
                placeholder="例如 openai/gpt-5-mini"
                value={summaryConfig.model}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">System Prompt</span>
              <textarea
                className="min-h-56 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-300/35"
                onChange={(event) =>
                  updateSummaryConfig("systemPrompt", event.target.value)
                }
                spellCheck={false}
                value={summaryConfig.systemPrompt}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">
                User Prompt Template
              </span>
              <textarea
                className="min-h-56 rounded-3xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-7 text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-300/35"
                onChange={(event) =>
                  updateSummaryConfig("userPromptTemplate", event.target.value)
                }
                spellCheck={false}
                value={summaryConfig.userPromptTemplate}
              />
            </label>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            目前模板佔位符：
            <span className="mx-2 rounded bg-white px-2 py-0.5 font-mono text-xs text-slate-700">
              {"{{text}}"}
            </span>
            預設 user prompt 長度 {summaryConfig.userPromptTemplate.length} 字元。
            {summaryConfig.userPromptTemplate.includes("{{text}}")
              ? " OCR 內容會插入這個位置。"
              : " 目前未放入佔位符，OCR 內容會自動附加到模板最後。"}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-slate-500">
                  OCR Text
                </p>
                <h2 className="mt-2 text-2xl font-medium text-slate-950">辨識結果</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {ocrProvider || "等待批次 OCR"}
              </span>
            </div>
            <textarea
              className="mt-5 min-h-[360px] w-full resize-y rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 text-base leading-7 text-slate-800 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-300/35"
              onChange={(event) => setOcrText(event.target.value)}
              placeholder="多張圖片的 OCR 結果會依檔名合併在這裡，你也可以手動修正後再重新彙總。"
              value={ocrText}
            />
          </article>

          <article className="rounded-[2rem] border border-slate-950/10 bg-[#fff8ec] p-6 shadow-[0_18px_60px_rgba(120,53,15,0.12)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-amber-700/70">
                  Copilot Summary
                </p>
                <h2 className="mt-2 text-2xl font-medium text-slate-950">摘要輸出</h2>
                <p className="mt-2 text-sm text-slate-600">
                  目前模型：{summaryConfig.model || "未設定"}
                </p>
              </div>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-600 ring-1 ring-amber-900/10">
                {summaryProvider || "等待摘要"}
              </span>
            </div>
            <div className="mt-5 min-h-[360px] rounded-[1.5rem] bg-white/75 px-5 py-4 text-base leading-8 text-slate-800 ring-1 ring-amber-900/10">
              {summary ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      onClick={handleOpenSummaryPreview}
                      type="button"
                    >
                      新分頁預覽 .md
                    </button>
                    <button
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
                      onClick={handleDownloadSummary}
                      type="button"
                    >
                      下載 .md
                    </button>
                    <button
                      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
                      onClick={handleDownloadReport}
                      type="button"
                    >
                      下載完整報告 .md
                    </button>
                  </div>
                  <textarea
                    className="min-h-[300px] w-full resize-y rounded-3xl border border-amber-900/10 bg-white px-4 py-3 font-mono text-sm leading-7 text-slate-800 outline-none"
                    onChange={(event) => {
                      const nextSummary = event.target.value;
                      setSummary(nextSummary);
                      syncSummaryDocument(nextSummary);
                    }}
                    spellCheck={false}
                    value={summary}
                  />
                </div>
              ) : (
                <p className="text-slate-500">
                  系統會先逐張壓縮並送去 OCR，再把全部文字合併後只做一次摘要。摘要會以 Markdown 格式輸出，你可以直接在線上選取內容、另開分頁預覽，或下載成 .md 檔。
                </p>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
