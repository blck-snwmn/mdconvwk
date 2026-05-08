import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";

type ConversionResponse = {
  name: string;
  mimeType: string;
  format: "markdown";
  tokens: number;
  data: string;
};

describe("API Routes", () => {
  describe("GET /html", () => {
    beforeAll(() => {
      // Activate fetch mocking
      fetchMock.activate();
      fetchMock.disableNetConnect();
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      // Ensure all mocks were called
      fetchMock.assertNoPendingInterceptors();
    });

    // 既存のテストケース
    it("should return 400 when URL parameter is missing", async () => {
      const res = await app.request("/html", {}, env);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty("error", "URL parameter is required");
      expect(json).toHaveProperty("status", 400);
    });

    it("should return 400 for invalid URL", async () => {
      const res = await app.request("/html?url=not-a-url", {}, env);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty("error", "Invalid URL format. Must be a valid HTTP or HTTPS URL");
      expect(json).toHaveProperty("status", 400);
    });

    it("should return 400 for non-HTTP(S) URLs", async () => {
      const res = await app.request("/html?url=ftp://example.com", {}, env);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toHaveProperty("error", "Invalid URL format. Must be a valid HTTP or HTTPS URL");
    });

    // 正常系のテスト
    it("should successfully convert HTML to Markdown", async () => {
      const mockHtml = "<h1>Test</h1><p>Content</p>";
      const mockMarkdown = "# Test\n\nContent";

      fetchMock
        .get("https://example.com")
        .intercept({ path: "/" })
        .reply(200, mockHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });

      // Mock toMarkdown to return array response
      env.AI.toMarkdown = vi.fn().mockImplementation(async (files) => {
        // Check if it's array input (our implementation uses array)
        if (Array.isArray(files)) {
          return [
            {
              name: "example.com.html",
              mimeType: "text/plain",
              format: "markdown" as const,
              tokens: 100,
              data: mockMarkdown,
            },
          ];
        }
        // Fallback for single file input
        return {
          name: "example.com.html",
          mimeType: "text/plain",
          format: "markdown" as const,
          tokens: 100,
          data: mockMarkdown,
        };
      });

      const res = await app.request("/html?url=https://example.com", {}, env);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/plain; charset=UTF-8");
      const text = await res.text();
      expect(text).toBe(mockMarkdown);
      // fetchMock automatically verifies the request was made
    });

    // fetchエラーのテスト
    it("should return 404 when URL is not found", async () => {
      fetchMock.get("https://example.com").intercept({ path: "/notfound" }).reply(404, "");

      const res = await app.request("/html?url=https://example.com/notfound", {}, env);

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toContain("Failed to fetch");
      expect(json.error).toContain("Not Found");
    });

    it("should return 500 when server error occurs", async () => {
      fetchMock.get("https://example.com").intercept({ path: "/error" }).reply(500, "");

      const res = await app.request("/html?url=https://example.com/error", {}, env);

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toContain("Failed to fetch");
    });

    // 非HTMLコンテンツのテスト
    it("should return 400 for non-HTML content", async () => {
      fetchMock
        .get("https://api.example.com")
        .intercept({ path: "/data.json" })
        .reply(200, '{"test": "data"}', {
          headers: { "Content-Type": "application/json" },
        });

      const res = await app.request("/html?url=https://api.example.com/data.json", {}, env);

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toBe("Only HTML content is supported");
    });

    // 大きすぎるコンテンツのテスト
    it("should return 413 for content too large", async () => {
      const largeContent = "x".repeat(11 * 1024 * 1024); // 11MB

      fetchMock
        .get("https://example.com")
        .intercept({ path: "/large" })
        .reply(200, largeContent, {
          headers: { "Content-Type": "text/html" },
        });

      const res = await app.request("/html?url=https://example.com/large", {}, env);

      expect(res.status).toBe(413);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toBe("Content too large. Maximum size is 10MB");
    });

    // AI変換エラーのテスト
    it("should return 500 when AI conversion fails with empty result", async () => {
      fetchMock
        .get("https://example.com")
        .intercept({ path: "/" })
        .reply(200, "<h1>Test</h1>", {
          headers: { "Content-Type": "text/html" },
        });

      // Mock toMarkdown to return empty array
      env.AI.toMarkdown = vi.fn().mockImplementation(async (files) => {
        if (Array.isArray(files)) {
          return [];
        }
        // This shouldn't happen in practice, but for completeness
        return {} as ConversionResponse;
      });

      const res = await app.request("/html?url=https://example.com", {}, env);

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toBe("Failed to convert HTML to Markdown");
    });

    it("should return 500 when AI conversion fails with null result", async () => {
      fetchMock
        .get("https://example.com")
        .intercept({ path: "/" })
        .reply(200, "<h1>Test</h1>", {
          headers: { "Content-Type": "text/html" },
        });

      // Mock toMarkdown to return null for error handling test
      // We need to force the return type for this error case
      const mockToMarkdown = vi.fn().mockResolvedValue(null);
      // Override the type to allow null return for testing
      env.AI.toMarkdown = mockToMarkdown as typeof env.AI.toMarkdown;

      const res = await app.request("/html?url=https://example.com", {}, env);

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toBe("Failed to convert HTML to Markdown");
    });

    // タイムアウトのテスト
    it("should return 504 on timeout", async () => {
      const timeoutError = new DOMException("The operation was aborted", "AbortError");
      fetchMock
        .get("https://slow.example.com")
        .intercept({ path: "/" })
        .replyWithError(timeoutError);

      const res = await app.request("/html?url=https://slow.example.com", {}, env);

      expect(res.status).toBe(504);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toBe("Request timeout");
    });

    // 予期しないエラーのテスト
    it("should return 500 for unexpected errors", async () => {
      fetchMock
        .get("https://example.com")
        .intercept({ path: "/" })
        .replyWithError(new Error("Network error"));

      const res = await app.request("/html?url=https://example.com", {}, env);

      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string; status: number };
      expect(json.error).toBe("Internal server error while processing request");
    });

    // キャッシュヘッダーのテスト
    it("should set proper cache headers on success", async () => {
      fetchMock
        .get("https://example.com")
        .intercept({ path: "/" })
        .reply(200, "<h1>Test</h1>", {
          headers: { "Content-Type": "text/html" },
        });

      // Mock toMarkdown for cache header test
      env.AI.toMarkdown = vi.fn().mockImplementation(async (files) => {
        if (Array.isArray(files)) {
          return [
            {
              name: "example.com.html",
              mimeType: "text/plain",
              format: "markdown" as const,
              tokens: 50,
              data: "# Test",
            },
          ];
        }
        return {
          name: "example.com.html",
          mimeType: "text/plain",
          format: "markdown" as const,
          tokens: 50,
          data: "# Test",
        };
      });

      const res = await app.request("/html?url=https://example.com", {}, env);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600, s-maxage=86400");
    });
  });
});
