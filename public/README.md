# Public Folder Structure

Static files are grouped by product area so frontend work can happen without
touching backend source files.

- `admin/`: admin dashboard pages, admin JavaScript, admin components, layout
  partials, and Metronic template partials. These are still served at legacy
  root URLs such as `/index.html`, `/dashboard.js`, and `/components/header.html`
  by `web-server.ts`.
- `auth/`: login page and authentication-facing static screens.
- `member/`: member chat portal static screens.
- `frontend/`: public frontend/login flow and its scoped assets.
- `assets/`: shared vendor/theme assets used across admin, auth, member, and
  frontend pages. Keep this path stable because many pages use `/assets/...`.
- `uploads/`: runtime-uploaded branding files. Keep this path stable because
  APIs return `/uploads/...` URLs.
- `manifest.json` and `firebase-messaging-sw.js`: PWA/browser entrypoints that
  must stay at the public root.
