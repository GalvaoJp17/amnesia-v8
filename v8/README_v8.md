# Amnesia AI Shield — v8

This is the greenfield scaffolding for the Amnesia AI Shield v8 Chrome extension. The extension focuses on local-first privacy features for large language model prompts and online meetings.

## Development quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the extension:
   ```bash
   npm run build
   ```
3. Load the `v8/dist` directory as an unpacked extension in Chrome.

Public assets live in `public/` and are copied into the build output. Source files reside under `src/`.

> Implementation for Text Shield and Meeting Shield will land in follow-up commits.
