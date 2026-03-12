Live Rishtey — Enhanced (README)

What this clone contains

- CSS variables for light/dark themes. Toggle with the "Toggle theme" button. Preference is stored in localStorage.
- Floating Action Button (FAB) with subtle pulsing shadow.
- Drawer (mobile) with focus trap and overlay.
- Skeleton loader shown while demo data loads.
- Lazy image blur-up CSS + IntersectionObserver stub (for real images use `data-src` on img tags).
- Decorative SVG blob in the header for a modern layered look.

How to test quickly

1. Open `index.enhanced.html` in a browser (mobile emulator recommended).
2. Theme toggle: click "Toggle theme" — the page should switch between light and dark tokens and persist after reload.
3. FAB & Drawer: on mobile viewports, the FAB appears; click it to open the drawer. Focus should move to the drawer and escaping/overlay click closes it.
4. Skeleton: when the page first loads you'll see a gray animated skeleton, then cards appear after a short delay.
5. Lazy blur-up: avatar images use a tiny inline SVG as a placeholder and remove blur when the image "loads". To test real lazy loading, add `data-src` attributes to `.avatar img` tags and remove the inline `src`.

Notes & next steps

- If you want Lottie animations, I can integrate them for the loader or empty state (requires adding `lottie-web` script).
- For production, replace data-URI placeholders with real images and update `IntersectionObserver` to set `src` from `data-src`.
- I can now port selected parts back into the main `index.html` if you'd like.
