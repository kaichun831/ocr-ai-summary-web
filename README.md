# OCR Copilot Workspace

這是一個以 Next.js 為基礎的網站，提供以下流程：

1. 一次上傳多張圖片。
2. 前端先壓縮圖片到較容易被 OCR 服務接受的大小。
3. 依序排隊送到 OCR 服務轉文字。
4. 將全部文字合併後，只送一次 GitHub Models API 做摘要。

## 功能說明

- 前端頁面可選取多張圖片並顯示每張的處理狀態。
- 圖片會在瀏覽器端先壓縮，再依序送出 OCR，避免一次併發造成失敗率過高。
- 所有成功的 OCR 文字會先合併成一份內容，再只呼叫一次摘要 API。
- 伺服器端 `/api/ocr` 會把圖片轉送到 OCR.space。
- 伺服器端 `/api/summarize` 會呼叫 GitHub Models 的 chat completions API。
- 網頁上可直接動態調整摘要模型、system prompt 與 user prompt template，再送到摘要 API。
- 摘要輸出為 Markdown，可直接線上選取、另開分頁做排版預覽，或下載為摘要與完整報告 `.md`。
- 若未設定摘要 API 金鑰，系統會回退到本地簡易摘要，方便先驗證流程。

## 環境變數

請先建立 `.env.local`，內容可參考 `.env.example`：

```env
OCR_SPACE_API_KEY=your_ocr_space_api_key
OCR_SPACE_LANGUAGE=eng

GITHUB_MODELS_TOKEN=your_github_personal_access_token
GITHUB_MODELS_ENDPOINT=https://models.github.ai/inference/chat/completions
GITHUB_MODELS_MODEL=openai/gpt-4.1-mini
```

## 如何取得 GitHub Models 的 API Key 與 URL

這裡要先釐清一件事：你在網站裡要接的不是 VS Code 內建的 Copilot 聊天登入憑證，而是 GitHub Models API。

- API URL 不需要申請，直接使用固定端點：`https://models.github.ai/inference/chat/completions`
- API Key 不是另外的 Copilot 專用 key，而是 GitHub Personal Access Token

取得方式：

1. 登入 GitHub。
2. 前往 GitHub Models 頁面，先確認你的帳號可以使用模型：`https://github.com/marketplace/models`
3. 前往 Personal Access Token 頁面建立 token：`https://github.com/settings/personal-access-tokens/new`
4. 建立 token 時，至少給它 `models:read` 權限。
5. 把產生的 token 填進 `.env.local` 的 `GITHUB_MODELS_TOKEN`。

如果你只是想先測 API 是否可用，也可以到 GitHub Models playground：

1. 打開 `https://github.com/marketplace/models`
2. 選一個模型
3. 進入 Playground
4. 切到 Code 分頁
5. GitHub 會顯示對應程式碼、模型名稱與 API 呼叫格式

目前專案預設模型是 `openai/gpt-4.1-mini`，你也可以在 `.env.local` 改成其他 GitHub Models 支援的模型。

## 本機啟動

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000` 即可使用。

## GitHub MCP

工作區已加入 GitHub 官方 remote MCP 設定，檔案位置在 `.vscode/mcp.json`。

啟用方式：

1. 使用支援 MCP 的 VS Code 版本。
2. 開啟 Chat 或 Copilot Chat。
3. 接受工作區內 GitHub MCP 伺服器的信任提示。
4. 在 Agent mode 中使用 GitHub 相關工具。

目前使用的是 GitHub 官方 remote MCP 端點：

```json
{
	"servers": {
		"github": {
			"type": "http",
			"url": "https://api.githubcopilot.com/mcp/"
		}
	}
}
```

這個設定不會把 GitHub token 寫死在專案裡，會優先使用 VS Code / GitHub Copilot 的登入與授權流程。

## 注意事項

- OCR 目前使用 OCR.space，你可以改寫 `/api/ocr` 換成其他服務。
- 摘要 API 預設採用 GitHub Models 端點。
- GitHub 官方文件指出，本機呼叫 API 時需要建立 GitHub Personal Access Token，並具備 `models:read` 權限。
- 如果安裝依賴時看到磁碟空間不足，必須先釋出磁碟空間，否則無法完成建置與執行。
