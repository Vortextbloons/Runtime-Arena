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
npm run arena -- web
```

Launches a Vite preview server.

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
npm run build:web             # Rebuild web UI with new results
```

The `prepare-results.ts` script handles copying the latest results into the static build.
