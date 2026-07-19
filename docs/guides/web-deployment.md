# Web Deployment

The web UI is a SvelteKit static site that can be deployed anywhere.

## Build

```bash
npm run build:web
```

This:
1. Copies `results/current.json` into `web/static/results/`
2. Builds the SvelteKit static site to `web/build/`

## Local Preview

```bash
npm run prepare-results   # if you use npm run dev instead of build:web
npm run dev               # Vite dev server at http://localhost:5173/
```

Or after a full static build:

```bash
npm run arena -- web
```

Launches a Vite preview server over `web/build/`.

## Deployment Options

Since the site uses `@sveltejs/adapter-static`, the output is plain HTML/CSS/JS with no server requirements.

### Static Hosting

Deploy the `web/build/` directory to any static host:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- S3 + CloudFront

### Docker

```dockerfile
FROM nginx:alpine
COPY web/build/ /usr/share/nginx/html/
```

## Updating Results

When new benchmark results are available:

```bash
npm run arena -- run          # Run benchmarks
npm run prepare-results       # Copy into web/static/results/ (required for npm run dev)
# or
npm run build:web             # prepare-results + production build
```

The `prepare-results.ts` script copies the canonical snapshot into `web/static/results/`,
keeping `persistent-worker` entries with measurement contract `1.0.0` or `1.1.0`.
When both exist for the same cell, `1.1.0` wins. Obsolete mutation-less rows are
pruned when mutation variants exist for the same benchmark/size.
