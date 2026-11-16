# Contributing

Cress is a local-first TypeScript CLI. Keep analysis static and read-only: do not import or execute analyzed projects, access networks, or write into the scanned tree. Keep declarations separate from interpretations and preserve uncertainty in the JSON schema.

## Development

Use Node.js 20 or newer and npm:

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run scan:example
```

Add focused Vitest coverage for analyzer behavior and update the README when supported patterns or JSON output change. Source, tests, and public documentation use English.
