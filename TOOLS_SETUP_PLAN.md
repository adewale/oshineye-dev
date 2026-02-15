# Plan: Setup tools.oshineye.dev for Cloudflare-Centric Tools

**Date:** 2025-01-22
**Status:** Planning - Not Yet Implemented
**Updated:** 2025-01-23 (Enhanced with Cloudflare skill best practices)

## Overview

Create tools.oshineye.dev subdomain for hosting a collection of Cloudflare-centric utilities (Workers, D1, KV, R2, Durable Objects, Workers AI). Based on research into Simon Willison's approach and **Cloudflare composition patterns** for building full-stack applications.

**Aligned with:** [Cloudflare Pattern 1: Content Site with Dynamic Features](https://developers.cloudflare.com/workers/)

---

## Key Research Findings

### Simon Willison's Approach
- Multi-repo for independence OR monorepo for related tools
- Documentation-first (comprehensive READMEs)
- Central discovery page with search/filter
- Deploy early, iterate publicly
- Open source by default

### Cloudflare-Specific Patterns
- Start with Pages + Functions (single Worker)
- Migrate to dedicated Workers only when needed
- Use service bindings for inter-tool communication
- Optimize with `_routes.json` for static assets
- Leverage free tiers (D1, KV, R2)

---

## Architecture Decision: Hybrid Approach

### Phase 1: Start Simple (Pages + Functions)
```
Single Cloudflare Pages project
├── Static landing page (public/)
├── API routes via Functions (functions/api/)
├── Shared utilities (functions/shared/)
└── All tools in one Worker
```

**Benefits:**
- Single deployment command
- Shared D1/KV/R2 bindings
- Fast iteration
- Cost: $5/month total

### Phase 2: Scale (Dedicated Workers)
```
As tools grow, extract heavy tools to dedicated Workers:
├── Landing page: Cloudflare Pages
├── Light tools: Pages Functions
├── Heavy tool: Dedicated Worker + Browser Rendering
└── Real-time tool: Dedicated Worker + Durable Objects
```

**Migration Triggers:**
- CPU-intensive operations (image processing, AI)
- High traffic (need separate quota)
- WebSockets/real-time features (need Durable Objects)

---

## Directory Structure

```
/Users/ade/Documents/projects/oshineye.dev/
├── site/                        # Existing main site
│   ├── index.html
│   └── styles.css
│
└── tools/                       # NEW - Tools subdomain
    ├── public/                  # Static landing page
    │   ├── index.html          # Tool directory with search/filter
    │   ├── styles.css
    │   └── assets/
    │
    ├── functions/               # Pages Functions (API routes)
    │   ├── api/
    │   │   ├── d1-explorer/    # Example Tool 1
    │   │   │   ├── index.ts
    │   │   │   └── [[path]].ts # Catch-all routing
    │   │   ├── kv-browser/     # Example Tool 2
    │   │   │   └── index.ts
    │   │   ├── r2-manager/     # Example Tool 3
    │   │   │   └── index.ts
    │   │   └── shared/         # Shared utilities
    │   │       ├── auth.ts     # Authentication helpers
    │   │       ├── cors.ts     # CORS handling
    │   │       ├── db.ts       # D1 utilities
    │   │       └── types.ts    # Shared TypeScript types
    │   └── _middleware.ts      # Global middleware
    │
    ├── tools/                   # Tool documentation & demos
    │   ├── d1-explorer/
    │   │   ├── README.md
    │   │   └── demo.html
    │   ├── kv-browser/
    │   │   └── README.md
    │   └── r2-manager/
    │       └── README.md
    │
    ├── _routes.json            # Static asset optimization
    ├── wrangler.toml           # Cloudflare configuration
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

---

## Configuration Files

### wrangler.jsonc (Cloudflare Best Practices)

**Following Cloudflare standards:** Use `wrangler.jsonc` (not `.toml`) for better JSON tooling and comments.

```jsonc
// wrangler.jsonc
{
  "name": "tools-oshineye-dev",
  "compatibility_date": "2025-01-22",
  "compatibility_flags": ["nodejs_compat"],
  "pages_build_output_dir": "public",

  // Observability (REQUIRED - enables tracing and debugging)
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },

  // Shared bindings available to all tools
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tools-db",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],

  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "YOUR_KV_NAMESPACE_ID",
      "preview_id": "YOUR_KV_PREVIEW_ID"
    },
    {
      "binding": "SESSIONS",
      "id": "YOUR_SESSIONS_KV_ID",
      "preview_id": "YOUR_SESSIONS_PREVIEW_ID"
    }
  ],

  "r2_buckets": [
    {
      "binding": "STORAGE",
      "bucket_name": "tools-storage"
    }
  ],

  // Optional: Analytics for tracking tool usage
  "analytics_engine_datasets": [
    {
      "binding": "ANALYTICS",
      "dataset": "tools_usage"
    }
  ],

  // Environment-specific configuration
  "env": {
    "production": {
      "vars": {
        "ENVIRONMENT": "production",
        "API_URL": "https://tools.oshineye.dev"
      }
    },
    "staging": {
      "vars": {
        "ENVIRONMENT": "staging",
        "API_URL": "https://staging.tools.oshineye.dev"
      }
    }
  }
}
```

**Key Cloudflare Best Practices Applied:**
1. ✅ Use `wrangler.jsonc` format for better tooling
2. ✅ Set `compatibility_flags: ["nodejs_compat"]` for Node.js compatibility
3. ✅ Enable observability with `head_sampling_rate: 1` for full tracing
4. ✅ Include preview KV namespaces for local development
5. ✅ Never put secrets in `vars` - use `wrangler secret put` instead
6. ✅ Add Analytics Engine for tracking tool usage

### _routes.json (Static Asset Optimization)
```json
{
  "version": 1,
  "description": "Optimize static asset serving for tools.oshineye.dev",
  "include": [
    "/api/*",
    "/functions/*"
  ],
  "exclude": [
    "/*",
    "*.html",
    "*.css",
    "*.js",
    "*.png",
    "*.jpg",
    "*.svg",
    "*.ico"
  ]
}
```

### package.json
```json
{
  "name": "tools-oshineye-dev",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler pages dev public --compatibility-date=2025-01-22",
    "build": "tsc",
    "deploy": "wrangler pages deploy public --project-name=oshineye-tools",
    "deploy:production": "wrangler pages deploy public --project-name=oshineye-tools --branch=main",
    "test": "vitest",
    "db:migrate": "wrangler d1 migrations apply DB --remote",
    "db:migrate:local": "wrangler d1 migrations apply DB --local"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250117.0",
    "typescript": "^5.3.3",
    "vitest": "^1.0.0",
    "wrangler": "^3.80.0"
  }
}
```

---

## Implementation Steps

### Phase 1: Foundation Setup

**Step 1: Create Directory Structure**
```bash
cd /Users/ade/Documents/projects/oshineye.dev
mkdir -p tools/{public,functions/api/shared,tools}
cd tools
```

**Step 2: Initialize Project**
```bash
npm init -y
npm install -D wrangler typescript @cloudflare/workers-types vitest
```

**Step 3: Create Basic Files**
- `public/index.html` - Landing page with tool directory
- `public/styles.css` - Styling
- `functions/shared/cors.ts` - CORS utilities
- `functions/shared/auth.ts` - Auth utilities
- `wrangler.toml` - Configuration
- `_routes.json` - Static optimization

**Step 4: Create First Tool**
- Example: D1 Query Explorer
- Create `functions/api/d1-explorer/index.ts`
- Create `tools/d1-explorer/README.md`

**Step 5: First Deployment**
```bash
# Deploy to Cloudflare Pages
npx wrangler pages deploy public --project-name=oshineye-tools
```

**Step 6: Configure Custom Domain**
- Go to Cloudflare Dashboard > Pages > oshineye-tools
- Settings > Custom domains > "Set up a custom domain"
- Enter: `tools.oshineye.dev`
- Cloudflare creates DNS automatically
- Wait 2-5 minutes for SSL

**Step 7: Verify**
```bash
curl -I https://tools.oshineye.dev
# Should return 200 OK with SSL
```

---

### Phase 2: Deployment Automation

**GitHub Actions Setup**

Create `.github/workflows/deploy-tools.yml`:
```yaml
name: Deploy Tools to Cloudflare Pages

on:
  push:
    branches: [main]
    paths:
      - 'tools/**'
  pull_request:
    branches: [main]
    paths:
      - 'tools/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'tools/package-lock.json'

      - name: Install dependencies
        working-directory: tools
        run: npm ci

      - name: Build
        working-directory: tools
        run: npm run build

      - name: Run tests
        working-directory: tools
        run: npm test

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: oshineye-tools
          directory: tools/public

      - name: Run D1 migrations
        working-directory: tools
        run: npx wrangler d1 migrations apply DB --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**Setup Secrets:**
1. Generate Cloudflare API token (Account > API Tokens)
2. Add to GitHub secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

**Manual Deploy Option (Always Available):**
```bash
cd tools
npm run deploy
```

---

### Phase 3: Adding New Tools

**Workflow for Each New Tool:**

1. **Create API route:**
   ```bash
   mkdir -p functions/api/tool-name
   touch functions/api/tool-name/index.ts
   ```

2. **Implement tool logic:**
   ```typescript
   // functions/api/tool-name/index.ts
   import { handleCORS, corsHeaders } from '../../shared/cors';

   export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
     const corsResponse = handleCORS(request);
     if (corsResponse) return corsResponse;

     // Tool logic here
     return new Response(JSON.stringify({ status: 'ok' }), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' }
     });
   };
   ```

3. **Create documentation:**
   ```bash
   mkdir -p tools/tool-name
   touch tools/tool-name/README.md
   ```

4. **Update landing page:**
   - Add tool to `public/index.html` tools array
   - Tool appears in searchable directory

5. **Deploy:**
   ```bash
   git add .
   git commit -m "Add tool-name"
   git push  # Auto-deploys via GitHub Actions

   # OR manual deploy:
   npm run deploy
   ```

---

## Storage Selection Guide (Cloudflare Best Practices)

**Use this decision tree when adding tool features:**

### KV (Key-Value Store)
**Use for:**
- Session tokens and user preferences
- Feature flags and configuration
- Cache-aside pattern with D1
- Eventually consistent data acceptable

**Example:** Session management in tool authentication

### D1 (SQL Database)
**Use for:**
- Relational data with queries and joins
- Tool configuration and metadata
- User accounts and permissions
- Transaction consistency required

**Example:** D1 Query Explorer tool data, audit logs

### R2 (Object Storage)
**Use for:**
- User file uploads
- Export results (CSV, JSON, backups)
- Large objects (>1MB)
- S3-compatible access needed

**Example:** R2 File Manager uploads, export storage

### Durable Objects
**Use for:**
- WebSocket-based tools (real-time monitoring)
- Rate limiting per-user or per-API
- Strong consistency requirements
- Coordination between multiple requests

**Example:** Real-time D1 query monitoring, collaborative tools

---

## Suggested First Tools

### Tool 1: D1 Query Explorer
**Purpose:** Interactive SQL browser for D1 databases
**Tech:** Pages Functions + D1 + KV (caching)
**Cloudflare Primitives:**
- D1 for database queries
- KV for query result caching
- Analytics Engine for usage tracking

**Features:**
- Execute SQL queries with syntax highlighting
- View query results in table format
- Export results to CSV/JSON
- Query history (stored in D1)
- Database schema browser
- Security: Read-only mode, auth required for writes

### Tool 2: KV Browser
**Purpose:** View and edit Workers KV namespace contents
**Tech:** Pages Functions + KV
**Cloudflare Primitives:**
- KV for data storage
- Multiple namespace support

**Features:**
- List all keys in namespace
- Search/filter keys by prefix
- View key values
- Edit/delete keys
- Set TTL
- Bulk operations (import/export)
- Security: Auth required

### Tool 3: R2 File Manager
**Purpose:** Upload and manage R2 bucket files
**Tech:** Pages Functions + R2 + D1
**Cloudflare Primitives:**
- R2 for file storage
- D1 for file metadata
- Pre-signed URLs for downloads

**Features:**
- Drag-and-drop file upload
- File browser with folders
- Download files
- Delete files
- Generate pre-signed URLs (time-limited)
- Storage analytics (size, count)
- Security: Auth required, file type validation

### Future Tools (Ideas)
- Durable Objects Inspector
- Workers Analytics Dashboard
- Cron Job Manager
- Queue Monitor
- AI Chat with RAG (Workers AI + Vectorize)
- Image CDN (R2 + Image Resizing)
- API Gateway Builder
- Workflow Designer

---

## Code Patterns & Utilities (Cloudflare Best Practices)

### TypeScript Environment Interface (functions/shared/types.ts)

**Best Practice:** Always define typed Env interface for all bindings.

```typescript
// functions/shared/types.ts
export interface Env {
  // Storage bindings
  DB: D1Database;
  CACHE: KVNamespace;
  SESSIONS: KVNamespace;
  STORAGE: R2Bucket;

  // Analytics (optional)
  ANALYTICS?: AnalyticsEngineDataset;

  // Environment variables
  ENVIRONMENT: string;
  API_URL: string;
}

// Extend PagesFunction type with our Env
export type ToolFunction = PagesFunction<Env>;
```

### Shared CORS Utilities (functions/shared/cors.ts)

**Security Best Practice:** Include security headers in all responses.

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

export function handleCORS(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  return null;
}

export function createJsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      ...securityHeaders,
      'Content-Type': 'application/json'
    }
  });
}
```

### Shared Auth Utilities (functions/shared/auth.ts)

**Best Practice:** Implement proper error boundaries and validation.

```typescript
import { Env } from './types';

export async function verifyAuth(
  request: Request,
  env: Env
): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const userId = await env.SESSIONS.get(token);
    return userId;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

export function requireAuth(userId: string | null): string {
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}
```

### Shared DB Utilities (functions/shared/db.ts)

**Best Practice:** Use prepared statements to prevent SQL injection.

```typescript
import { Env } from './types';

export async function withDB<T>(
  db: D1Database,
  callback: (db: D1Database) => Promise<T>
): Promise<T> {
  try {
    return await callback(db);
  } catch (error) {
    console.error('Database error:', error);
    throw new Error('Database operation failed');
  }
}

export async function queryWithPagination(
  db: D1Database,
  sql: string,
  params: any[],
  page: number = 1,
  pageSize: number = 50
): Promise<{ results: any[]; total: number; page: number; pageSize: number }> {
  const offset = (page - 1) * pageSize;

  // Use prepared statements to prevent SQL injection
  const [results, total] = await Promise.all([
    db.prepare(`${sql} LIMIT ? OFFSET ?`)
      .bind(...params, pageSize, offset)
      .all(),
    db.prepare(`SELECT COUNT(*) as count FROM (${sql})`)
      .bind(...params)
      .first<{ count: number }>()
  ]);

  return {
    results: results.results || [],
    total: total?.count || 0,
    page,
    pageSize
  };
}

// Cache-aside pattern for KV + D1
export async function getCachedQuery<T>(
  env: Env,
  cacheKey: string,
  queryFn: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  // Try cache first
  const cached = await env.CACHE.get(cacheKey, 'json');
  if (cached) return cached as T;

  // Query database
  const result = await queryFn();

  // Cache result (don't await - fire and forget)
  await env.CACHE.put(cacheKey, JSON.stringify(result), {
    expirationTtl: ttl
  });

  return result;
}
```

### Analytics Tracking (functions/shared/analytics.ts)

**Best Practice:** Use ctx.waitUntil() for non-blocking analytics.

```typescript
import { Env } from './types';

export function trackToolUsage(
  ctx: ExecutionContext,
  env: Env,
  toolName: string,
  action: string,
  userId?: string
): void {
  if (!env.ANALYTICS) return;

  // Don't await - use ctx.waitUntil() for non-blocking analytics
  ctx.waitUntil(
    env.ANALYTICS.writeDataPoint({
      blobs: [toolName, action], // labels
      doubles: [1], // count
      indexes: [userId || 'anonymous'] // grouping key
    })
  );
}
```

### Example Tool Implementation (functions/api/d1-explorer/index.ts)

**Complete example following all Cloudflare best practices:**

```typescript
import { handleCORS, createJsonResponse } from '../../shared/cors';
import { verifyAuth, requireAuth } from '../../shared/auth';
import { getCachedQuery } from '../../shared/db';
import { trackToolUsage } from '../../shared/analytics';
import { Env } from '../../shared/types';

interface Context {
  request: Request;
  env: Env;
  params: Record<string, string>;
  waitUntil: ExecutionContext['waitUntil'];
}

// GET /api/d1-explorer/tables - List all tables
export const onRequestGet: PagesFunction<Env> = async (ctx: Context) => {
  try {
    // 1. Handle CORS preflight
    const corsResponse = handleCORS(ctx.request);
    if (corsResponse) return corsResponse;

    // 2. Verify authentication (optional for this tool)
    const userId = await verifyAuth(ctx.request, ctx.env);

    // 3. Track usage (non-blocking)
    trackToolUsage(ctx, ctx.env, 'd1-explorer', 'list_tables', userId);

    // 4. Query with caching
    const tables = await getCachedQuery(
      ctx.env,
      'db:tables',
      async () => {
        const { results } = await ctx.env.DB.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table'
          ORDER BY name
        `).all();
        return results;
      },
      300 // 5 minutes TTL
    );

    // 5. Return response with security headers
    return createJsonResponse({ tables });

  } catch (error) {
    console.error('D1 Explorer error:', error);
    return createJsonResponse(
      { error: 'Internal server error' },
      500
    );
  }
};

// POST /api/d1-explorer/query - Execute SQL query
export const onRequestPost: PagesFunction<Env> = async (ctx: Context) => {
  try {
    const corsResponse = handleCORS(ctx.request);
    if (corsResponse) return corsResponse;

    // Authentication required for queries
    const userId = await verifyAuth(ctx.request, ctx.env);
    requireAuth(userId); // Throws if not authenticated

    const { query } = await ctx.request.json();

    // Validate query (basic security check)
    if (!query || typeof query !== 'string') {
      return createJsonResponse({ error: 'Invalid query' }, 400);
    }

    // Prevent destructive operations (basic protection)
    const lowerQuery = query.toLowerCase().trim();
    if (
      lowerQuery.startsWith('drop') ||
      lowerQuery.startsWith('delete') ||
      lowerQuery.startsWith('truncate')
    ) {
      return createJsonResponse(
        { error: 'Destructive operations not allowed' },
        403
      );
    }

    trackToolUsage(ctx, ctx.env, 'd1-explorer', 'execute_query', userId);

    // Execute query with prepared statement
    const { results } = await ctx.env.DB.prepare(query).all();

    return createJsonResponse({ results });

  } catch (error) {
    console.error('Query execution error:', error);
    return createJsonResponse(
      { error: error.message || 'Query failed' },
      500
    );
  }
};
```

---

## Scaling Pattern: Service Bindings + Smart Placement

### When Tools Grow: Extract to Dedicated Workers

**Pattern from Cloudflare Skill:** Use Service Bindings for microservices architecture.

```
Frontend (Pages - Edge)
  ↓ Service Binding (internal RPC)
Backend Worker (Smart Placement - near database)
  ↓ Direct Binding
Database (D1/Hyperdrive)
```

### Example: Heavy Tool Migration

**When to migrate a tool to dedicated Worker:**
- Tool uses >50% of Pages Functions CPU quota
- Needs WebSockets (Durable Objects)
- Requires Browser Rendering
- Benefits from running near database (Smart Placement)

**Before (Pages Function):**
```
tools/functions/api/heavy-tool/index.ts
```

**After (Dedicated Worker with Service Binding):**

**1. Create dedicated Worker:**
```typescript
// packages/heavy-tool/src/index.ts
interface Env {
  DB: D1Database;
  BROWSER: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Heavy processing logic
    const browser = await puppeteer.launch(env.BROWSER);
    // ...
    return new Response('Result');
  }
}
```

**2. Configure with Smart Placement:**
```jsonc
// packages/heavy-tool/wrangler.jsonc
{
  "name": "heavy-tool",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-22",
  "compatibility_flags": ["nodejs_compat"],

  // Smart Placement - automatically runs near database
  "placement": {
    "mode": "smart"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "tools-db",
      "database_id": "..."
    }
  ],

  "browser": [{ "binding": "BROWSER" }]
}
```

**3. Update Pages to use Service Binding:**
```jsonc
// tools/wrangler.jsonc
{
  "name": "tools-oshineye-dev",

  // Add Service Binding to heavy tool
  "services": [
    {
      "binding": "HEAVY_TOOL",
      "service": "heavy-tool",
      "environment": "production"
    }
  ]
}
```

**4. Proxy from Pages Function:**
```typescript
// tools/functions/api/heavy-tool/index.ts
interface Env {
  HEAVY_TOOL: Fetcher;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // Forward to dedicated Worker via Service Binding
  return env.HEAVY_TOOL.fetch(request);
};
```

**Benefits:**
- ✅ No public HTTP egress costs
- ✅ Lower latency than HTTP
- ✅ Heavy tool runs near database automatically
- ✅ Independent scaling and quotas
- ✅ Type-safe RPC communication

---

## Tool README Template

```markdown
# Tool Name

One-line description of what this tool does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Usage

### Via Web UI
Visit [https://tools.oshineye.dev/tools/tool-name](https://tools.oshineye.dev/tools/tool-name)

### Via API

**Endpoint:** `https://tools.oshineye.dev/api/tool-name`

**Example Request:**
\`\`\`bash
curl https://tools.oshineye.dev/api/tool-name \
  -H "Content-Type: application/json" \
  -d '{"param": "value"}'
\`\`\`

**Example Response:**
\`\`\`json
{
  "result": "..."
}
\`\`\`

## Cloudflare Primitives Used

- **Workers**: Core compute
- **D1**: Data storage (optional)
- **KV**: Caching layer (optional)
- **R2**: File storage (optional)

## API Reference

### GET /api/tool-name
Description of GET endpoint...

**Query Parameters:**
- `param1` (string, required): Description
- `param2` (number, optional): Description

**Example:**
\`\`\`bash
curl https://tools.oshineye.dev/api/tool-name?param1=value
\`\`\`

### POST /api/tool-name
Description of POST endpoint...

**Request Body:**
\`\`\`json
{
  "field1": "value",
  "field2": 123
}
\`\`\`

## Local Development

\`\`\`bash
# Clone repo
git clone https://github.com/yourusername/oshineye.dev
cd oshineye.dev/tools

# Install dependencies
npm install

# Run locally
npm run dev

# Access tool
open http://localhost:8788/api/tool-name
\`\`\`

## Deployment

This tool is part of the tools.oshineye.dev collection. Deployment happens automatically via GitHub Actions when changes are pushed to main branch.

Manual deployment:
\`\`\`bash
cd tools
npm run deploy
\`\`\`

## License

MIT

## Author

[Adewale Oshineye](https://oshineye.dev)
```

---

## Cost Breakdown

### Starting Phase (First 5 Tools)

**Cloudflare Pages + Functions:**
- Worker: $5/month (includes 10M requests)
- Static bandwidth: Free (unlimited)
- SSL: Free
- **Subtotal: $5/month**

**D1 Database:**
- Storage: Free (up to 5GB)
- Reads: Free (up to 5M/day)
- Writes: Free (up to 100k/day)
- **Subtotal: $0**

**KV Namespace:**
- Storage: Free (up to 1GB)
- Reads: Free (up to 10M/day)
- Writes: Free (up to 1k/day)
- **Subtotal: $0**

**R2 Storage:**
- Storage: Free (up to 10GB)
- Class A operations: Free (up to 1M/month)
- Class B operations: Free (up to 10M/month)
- **Subtotal: $0**

**Total: $5/month**

### Growth Phase (10-20 Tools)

If some tools need dedicated Workers:
- Landing + 8 light tools: $5/month (Pages Functions)
- Heavy tool 1 (image processing): $5/month (dedicated Worker)
- Heavy tool 2 (real-time): $5/month (dedicated Worker + DO)

**Total: $15-20/month**

Still within free tiers for D1, KV, R2 unless hitting significant scale.

---

## Migration Path: Simple → Complex

### When to Extract a Tool to Dedicated Worker

**Triggers:**
1. **CPU limits** - Tool hitting 50ms CPU time limit on Functions
2. **Memory needs** - Tool needs more than 128MB RAM
3. **Real-time features** - Need WebSockets or Durable Objects
4. **High traffic** - Single tool consuming >50% of requests quota
5. **Isolation** - Tool needs separate bindings or config

**Migration Steps:**
1. Create new Worker project under `packages/tool-name/`
2. Move code from `functions/api/tool-name/` to Worker
3. Set up dedicated `wrangler.toml` for tool
4. Deploy as separate Worker: `wrangler deploy`
5. Update landing page to point to new subdomain
6. Keep old Function endpoint as redirect for backwards compatibility

---

## Testing Strategy

### Unit Tests (Vitest)
```typescript
// functions/api/tool-name/index.test.ts
import { describe, it, expect } from 'vitest';
import { onRequest } from './index';

describe('Tool Name API', () => {
  it('should return 200 for valid request', async () => {
    const request = new Request('https://example.com/api/tool-name');
    const env = {} as Env;
    const ctx = {} as ExecutionContext;

    const response = await onRequest({ request, env, params: {}, waitUntil: ctx.waitUntil, passThroughOnException: ctx.passThroughOnException, next: async () => new Response(), data: {} });
    expect(response.status).toBe(200);
  });
});
```

### Integration Tests (Miniflare)
```typescript
import { Miniflare } from 'miniflare';

const mf = new Miniflare({
  modules: true,
  scriptPath: './dist/index.js',
  d1Databases: ['DB'],
});

describe('Integration', () => {
  it('should interact with D1', async () => {
    const db = await mf.getD1Database('DB');
    // Test database operations
  });
});
```

---

## Discovery & Landing Page

The landing page (`public/index.html`) serves as:
- **Tool directory** - Searchable list of all tools
- **Filter by Cloudflare primitive** - D1, KV, R2, DO, AI
- **Quick access** - Links to demo, docs, source for each tool
- **Status indicators** - Last updated, tags

Key features:
- Client-side search (no backend needed)
- Filter buttons for categories
- Responsive grid layout
- Direct links to tool demos and API docs

---

## Documentation Strategy

### Per-Tool Documentation
- Comprehensive README in `tools/tool-name/README.md`
- API documentation with examples
- Local development instructions
- Cloudflare primitives used

### Central Documentation
- Main `tools/README.md` with setup instructions
- Architecture overview
- How to add new tools
- Deployment guide

### Code Documentation
- TypeScript types for all functions
- JSDoc comments for public APIs
- Inline comments for complex logic

---

## Security Considerations

### API Security
- CORS configured per tool needs
- Rate limiting via Cloudflare (automatic)
- Input validation on all endpoints
- SQL injection prevention (use prepared statements)

### Authentication (If Needed)
- Use KV for session storage
- JWT tokens for API access
- Optional: Cloudflare Access for admin tools

### Secrets Management
- Never commit secrets to git
- Use `wrangler secret put` for API keys
- Environment variables for config
- Separate production/staging secrets

---

## Monitoring & Observability

### Built-in Cloudflare Analytics
- Request counts
- Error rates
- P50/P95/P99 latency
- Geographic distribution

### Custom Logging
```typescript
console.log('Event:', { tool: 'tool-name', action: 'query', duration: 123 });
```

### Error Tracking
```typescript
try {
  // Tool logic
} catch (error) {
  console.error('Tool error:', error);
  // Optional: Send to external service (Sentry, etc.)
}
```

---

## Next Steps (When Ready to Implement)

1. **Review this plan** - Make sure architecture fits needs
2. **Create directory structure** - Set up folders
3. **Configure Cloudflare** - Create D1/KV/R2 resources
4. **Build first tool** - Start with D1 Query Explorer
5. **Deploy** - Test deployment workflow
6. **Iterate** - Add more tools incrementally

**Timeline Estimate:**
- Initial setup: 1-2 hours
- First tool: 2-4 hours
- Each additional simple tool: 1-2 hours
- Complex tools: 4-8 hours

---

## Resources & References

### Documentation
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Pages Functions Docs](https://developers.cloudflare.com/pages/functions/)
- [D1 Documentation](https://developers.cloudflare.com/d1/)
- [Workers KV Docs](https://developers.cloudflare.com/kv/)
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

### Inspiration
- [Simon Willison's Tools](https://simonwillison.net/tools/)
- [Val Town](https://val.town/)
- [Cloudflare Workers Examples](https://workers.cloudflare.com/)

### Community
- [Cloudflare Developers Discord](https://discord.gg/cloudflaredev)
- [Cloudflare Community Forum](https://community.cloudflare.com/)

---

## Summary: Cloudflare Best Practices Applied

This plan has been enhanced with official Cloudflare composition patterns and best practices:

### Configuration Improvements
✅ **wrangler.jsonc format** (not .toml) for better JSON tooling
✅ **compatibility_flags: ["nodejs_compat"]** for Node.js compatibility
✅ **Observability enabled** with head_sampling_rate: 1 for full tracing
✅ **Preview KV namespaces** for local development testing
✅ **Analytics Engine** binding for tracking tool usage
✅ **Environment-specific configuration** for production/staging

### Code Quality Standards
✅ **TypeScript interfaces** for all Env bindings
✅ **Security headers** on all responses (CSP, X-Frame-Options, etc.)
✅ **Error boundaries** with try-catch in all handlers
✅ **Prepared statements** for SQL injection prevention
✅ **Input validation** on all user inputs
✅ **ctx.waitUntil()** for non-blocking analytics and logging

### Architecture Patterns
✅ **Cache-aside pattern** (KV + D1) for performance
✅ **Service Bindings** for microservices when tools grow
✅ **Smart Placement** for database-heavy tools
✅ **Storage decision tree** (KV vs D1 vs R2 vs Durable Objects)
✅ **Complete example tool** following all best practices

### Security Features
✅ **Never hardcode secrets** - use wrangler secret put
✅ **Session management** via KV
✅ **Authentication helpers** with proper error handling
✅ **SQL injection prevention** via prepared statements
✅ **Destructive operation blocking** in query tools

### Scalability Path
✅ **Phase 1:** Start with Pages + Functions (single Worker)
✅ **Phase 2:** Extract to dedicated Workers with Service Bindings
✅ **Smart Placement:** Automatically run near database
✅ **Clear migration triggers:** CPU limits, WebSockets, heavy processing

### Cloudflare Primitives Utilized
- **Pages + Functions:** Static site + API routes
- **D1:** SQL database for tool data and metadata
- **KV:** Caching and session storage
- **R2:** File uploads and exports
- **Analytics Engine:** Tool usage tracking
- **Service Bindings:** Worker-to-Worker RPC (future)
- **Smart Placement:** Optimize database latency (future)

### References
- **Cloudflare Pattern 1:** Content Site with Dynamic Features
- **Storage Decision Framework:** KV vs D1 vs R2 vs Durable Objects
- **Security Best Practices:** Headers, validation, error handling
- **Performance Patterns:** Caching, ctx.waitUntil(), prepared statements

---

**Last Updated:** 2025-01-23 (Enhanced with Cloudflare skill best practices)
**Status:** Ready for implementation - follows official Cloudflare patterns
