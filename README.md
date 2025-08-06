# mdconvwk

HTML to Markdown converter using Cloudflare Workers API

## Overview

Fetches HTML content from a specified URL and converts it to Markdown format using Cloudflare AI.

## Endpoint

```
GET /html?url={URL}
```

### Parameters

- `url` (required): URL of the HTML page to convert

### Response

- Success: Markdown formatted text
- Error: JSON error message

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Deploy
pnpm deploy
```

## Tech Stack

- Cloudflare Workers
- Hono (Web framework)
- Cloudflare AI (HTML to Markdown conversion)
- TypeScript
- Vitest (Testing)
