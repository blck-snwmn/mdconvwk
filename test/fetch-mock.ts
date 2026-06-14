import { vi } from "vitest";

type InterceptOptions = {
  path: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

type MockResponseOptions = {
  headers?: Record<string, string>;
};

type MockEntry = InterceptOptions & {
  origin: string;
  used: boolean;
  handler: () => Response | Promise<Response>;
};

const statusText = new Map([
  [200, "OK"],
  [400, "Bad Request"],
  [404, "Not Found"],
  [500, "Internal Server Error"],
]);

const entries: MockEntry[] = [];

export const fetchMock = {
  activate() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.clone().text();
      const entry = entries.find((item) => {
        if (item.used) return false;
        if (item.origin !== url.origin) return false;
        if (item.path !== `${url.pathname}${url.search}`) return false;
        if (item.method && item.method !== request.method) return false;
        if (item.body !== undefined && item.body !== body) return false;
        if (item.headers) {
          return Object.entries(item.headers).every(
            ([key, value]) => request.headers.get(key) === value,
          );
        }
        return true;
      });

      if (!entry) throw new Error(`No fetch mock matched ${request.method} ${request.url}`);
      entry.used = true;
      return entry.handler();
    });
  },
  disableNetConnect() {},
  assertNoPendingInterceptors() {
    const pending = entries.filter((entry) => !entry.used);
    entries.length = 0;
    if (pending.length > 0) {
      throw new Error(
        `Pending fetch mocks: ${pending.map((entry) => `${entry.method ?? "GET"} ${entry.origin}${entry.path}`).join(", ")}`,
      );
    }
  },
  get(origin: string) {
    return {
      intercept(options: InterceptOptions) {
        return {
          reply(status: number, data = "", optionsArg: MockResponseOptions = {}) {
            entries.push({
              ...options,
              origin,
              used: false,
              handler: () =>
                new Response(data, {
                  status,
                  statusText: statusText.get(status),
                  headers: optionsArg.headers,
                }),
            });
          },
          replyWithError(error: Error) {
            const errorName = error.name;
            const errorMessage = error.message;
            entries.push({
              ...options,
              origin,
              used: false,
              handler: () => {
                if (error instanceof DOMException) {
                  throw new DOMException(errorMessage, errorName);
                }
                throw new Error(errorMessage);
              },
            });
          },
        };
      },
    };
  },
};
