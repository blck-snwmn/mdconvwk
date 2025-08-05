import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index";

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// Mock AI binding
const mockAI = {
	toMarkdown: vi.fn(),
};

const mockEnv = {
	AI: mockAI,
};

describe("API Routes", () => {
	describe("GET /html", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		// 既存のテストケース
		it("should return 400 when URL parameter is missing", async () => {
			const res = await app.request("/html", {}, mockEnv);
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toHaveProperty("error", "URL parameter is required");
			expect(json).toHaveProperty("status", 400);
		});

		it("should return 400 for invalid URL", async () => {
			const res = await app.request("/html?url=not-a-url", {}, mockEnv);
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toHaveProperty(
				"error",
				"Invalid URL format. Must be a valid HTTP or HTTPS URL",
			);
			expect(json).toHaveProperty("status", 400);
		});

		it("should return 400 for non-HTTP(S) URLs", async () => {
			const res = await app.request("/html?url=ftp://example.com", {}, mockEnv);
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json).toHaveProperty(
				"error",
				"Invalid URL format. Must be a valid HTTP or HTTPS URL",
			);
		});

		// 正常系のテスト
		it("should successfully convert HTML to Markdown", async () => {
			const mockHtml = "<h1>Test</h1><p>Content</p>";
			const mockMarkdown = "# Test\n\nContent";

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
				text: async () => mockHtml,
			});

			mockAI.toMarkdown.mockResolvedValueOnce([{ data: mockMarkdown }]);

			const res = await app.request(
				"/html?url=https://example.com",
				{},
				mockEnv,
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain; charset=UTF-8");
			const text = await res.text();
			expect(text).toBe(mockMarkdown);
			expect(mockFetch).toHaveBeenCalledWith("https://example.com");
		});

		// fetchエラーのテスト
		it("should return 404 when URL is not found", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const res = await app.request(
				"/html?url=https://example.com/notfound",
				{},
				mockEnv,
			);

			expect(res.status).toBe(404);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toContain("Failed to fetch");
			expect(json.error).toContain("Not Found");
		});

		it("should return 500 when server error occurs", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const res = await app.request(
				"/html?url=https://example.com/error",
				{},
				mockEnv,
			);

			expect(res.status).toBe(500);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toContain("Failed to fetch");
		});

		// 非HTMLコンテンツのテスト
		it("should return 400 for non-HTML content", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "Content-Type": "application/json" }),
				text: async () => '{"test": "data"}',
			});

			const res = await app.request(
				"/html?url=https://api.example.com/data.json",
				{},
				mockEnv,
			);

			expect(res.status).toBe(400);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toBe("Only HTML content is supported");
		});

		// 大きすぎるコンテンツのテスト
		it("should return 413 for content too large", async () => {
			const largeContent = "x".repeat(11 * 1024 * 1024); // 11MB

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () => largeContent,
			});

			const res = await app.request(
				"/html?url=https://example.com/large",
				{},
				mockEnv,
			);

			expect(res.status).toBe(413);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toBe("Content too large. Maximum size is 10MB");
		});

		// AI変換エラーのテスト
		it("should return 500 when AI conversion fails with empty result", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () => "<h1>Test</h1>",
			});

			mockAI.toMarkdown.mockResolvedValueOnce([]);

			const res = await app.request(
				"/html?url=https://example.com",
				{},
				mockEnv,
			);

			expect(res.status).toBe(500);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toBe("Failed to convert HTML to Markdown");
		});

		it("should return 500 when AI conversion fails with null result", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () => "<h1>Test</h1>",
			});

			mockAI.toMarkdown.mockResolvedValueOnce(null);

			const res = await app.request(
				"/html?url=https://example.com",
				{},
				mockEnv,
			);

			expect(res.status).toBe(500);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toBe("Failed to convert HTML to Markdown");
		});

		// タイムアウトのテスト
		it("should return 504 on timeout", async () => {
			const timeoutError = new DOMException(
				"The operation was aborted",
				"AbortError",
			);
			mockFetch.mockRejectedValueOnce(timeoutError);

			const res = await app.request(
				"/html?url=https://slow.example.com",
				{},
				mockEnv,
			);

			expect(res.status).toBe(504);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toBe("Request timeout");
		});

		// 予期しないエラーのテスト
		it("should return 500 for unexpected errors", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			const res = await app.request(
				"/html?url=https://example.com",
				{},
				mockEnv,
			);

			expect(res.status).toBe(500);
			const json = (await res.json()) as { error: string; status: number };
			expect(json.error).toBe("Internal server error while processing request");
		});

		// キャッシュヘッダーのテスト
		it("should set proper cache headers on success", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ "Content-Type": "text/html" }),
				text: async () => "<h1>Test</h1>",
			});

			mockAI.toMarkdown.mockResolvedValueOnce([{ data: "# Test" }]);

			const res = await app.request(
				"/html?url=https://example.com",
				{},
				mockEnv,
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Cache-Control")).toBe(
				"public, max-age=3600, s-maxage=86400",
			);
		});
	});
});
