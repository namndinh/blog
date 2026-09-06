# nam-blog MCP

Remote MCP server for this blog, hosted as a Cloudflare Worker. Public agents can search and fetch published posts. Token holders open **draft** pull requests. Nothing goes live until a human merges and sets `draft: false`.

## Connect Cloudflare

```bash
cd mcp
npx wrangler login --device --browser=false
```

Approve the printed URL and code on dash.cloudflare.com. Then:

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put MCP_TOKENS
npx wrangler deploy
```

`GITHUB_TOKEN` needs Contents and Pull requests on `namndinh/blog`. `MCP_TOKENS` is a JSON array of hashed records from `npm run token`.

## Local

```bash
cd mcp
npm install
npm test
npx wrangler dev
```

- Health: `http://127.0.0.1:8787/health`
- MCP: `http://127.0.0.1:8787/mcp`
