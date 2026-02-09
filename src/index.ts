import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { timing } from "hono/timing";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", timing());
app.use("*", logger());
app.get("/html", async (c) => {
  const url = new URL(c.req.url);
  const urlParam = url.searchParams.get("url");

  if (!urlParam) {
    throw new HTTPException(400, { message: "URL parameter is required" });
  }

  if (!isValidUrl(urlParam)) {
    throw new HTTPException(400, {
      message: "Invalid URL format. Must be a valid HTTP or HTTPS URL",
    });
  }

  try {
    const resp = await fetch(urlParam);

    if (!resp.ok) {
      throw new HTTPException(resp.status as ContentfulStatusCode, {
        message: `Failed to fetch ${urlParam}: ${resp.statusText}`,
      });
    }

    const contentType = resp.headers.get("Content-Type");

    // HTMLコンテンツのみを処理
    if (!contentType || !contentType.includes("text/html")) {
      throw new HTTPException(400, {
        message: "Only HTML content is supported",
      });
    }

    const body = await resp.text();

    // サイズ制限チェック（例：10MB）
    if (body.length > 10 * 1024 * 1024) {
      throw new HTTPException(413, {
        message: "Content too large. Maximum size is 10MB",
      });
    }

    // Use AI binding to convert HTML to Markdown
    const markdown = await c.env.AI.toMarkdown([
      {
        name: `${new URL(urlParam).hostname}.html`,
        blob: new Blob([body], { type: contentType }),
      },
    ]);

    if (!markdown || markdown.length === 0) {
      throw new HTTPException(500, {
        message: "Failed to convert HTML to Markdown",
      });
    }

    const content = markdown[0].data;

    return c.text(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HTTPException(504, { message: "Request timeout" });
    }

    console.error("Unexpected error:", error);
    throw new HTTPException(500, {
      message: "Internal server error while processing request",
    });
  }
});

// Error handler
app.onError((err, c) => {
  console.error(err);

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message,
        status: err.status,
      },
      err.status,
    );
  }

  return c.json(
    {
      error: "Internal Server Error",
      status: 500,
    },
    500,
  );
});

export default app;

// URLのバリデーション
const isValidUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
