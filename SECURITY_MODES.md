# Security Modes

This workspace is split into two tracks.

## Dev Mode

- Source of truth for debugging
- Readable modules
- Console logging enabled
- Global debug helpers:
  - `window.__DEV__`
  - `window.__INSTA_RUNTIME__`
  - `window.__INSTA_ERROR_LOGS__`
- Optional test data injection through:
  - `window.__INSTA_RUNTIME__.setTestData()`
  - `window.__INSTA_RUNTIME__.clearTestData()`

Run it with:

```bash
npm run dev
```

Static build:

```bash
npm run build
```

## Protected Publish

- `npm run publish:protected-root` rebuilds `dist-protected/`, verifies it, and mirrors the protected output into the repo root for GitHub Pages publishing.
- This intentionally overwrites the live root `index.html`, `js/`, `styles/`, and related public files with the protected build.
- `CNAME` is preserved, and `jsdata.json` / `jsdata.json.gz` are removed from the published root.

## Protected Mode

### Strict production preset

- Output folder: `dist-protected/`
- Allowed hosts: `instarishta.me`, `www.instarishta.me`
- No localhost support

Build it with:

```bash
npm run protect
```

Verify it with:

```bash
npm run verify:protected
```

Serve it with:

```bash
npm run start:protected
```

### Local protected preset

- Output folder: `dist-protected-local/`
- Allowed hosts: `localhost`, `127.0.0.1`
- Separate wrapped data keys for local testing

Build it with:

```bash
npm run protect:local
```

Verify it with:

```bash
npm run verify:protected:local
```

Serve it with:

```bash
npm run start:protected:local
```

## Notes

- Protected mode still cannot make a static frontend truly secret. It raises reverse-engineering cost and makes tampering fragile.
- We debug the readable source first, then harden the generated protected output.
