# SPA Route UI Overrides

This note captures the fixes and reusable patterns behind two recent Xboard UI customizations:

- the legal footer that should appear only on login/register pages
- the dashboard welcome modal that should appear only when entering the dashboard

The goal is to avoid repeating the same debugging cycle when working with SPA-only route changes in the future.

## Problem Summary

The Xboard frontend is a single-page application. In this setup, moving from one page to another often means an internal route transition, not a full page reload.

That has two important consequences:

1. `DOMContentLoaded` is not enough
   A script that runs only on initial page load will miss later in-app route transitions.
2. `hashchange` or `popstate` alone may still be insufficient
   Depending on how the frontend router updates state, some transitions are not reliably observable through just one browser event.

## Symptoms We Hit

### 1. Login/Register Footer Stuck on Dashboard

We originally added a legal footer in `theme/Xboard/dashboard.blade.php` and only wanted it on login/register routes.

It behaved correctly on first load, but after:

- opening `/#/login`
- logging in
- landing on `/#/dashboard`

the footer stayed visible because the page shell was reused and the route switched without a full reload.

### 2. Dashboard Welcome Modal Only Worked After Refresh

The welcome modal initially showed only when:

- the dashboard page was refreshed
- or the browser back button returned to the dashboard

It did not show reliably when users moved into the dashboard via the app's own navigation or after login, because those were SPA route transitions rather than fresh document loads.

## Reusable Fix Pattern

The working pattern is:

1. Treat the page as an SPA, not as a multi-page app
2. Build a small route-sync function
3. Call it from:
   - `DOMContentLoaded`
   - `hashchange`
   - `popstate`
   - a short interval poll as a final fallback
4. Trigger UI only on route-edge transitions when needed

In practice, the interval fallback is what makes the customization resilient when the router changes state in a way that does not reliably surface as a browser event.

## Current Implementations

### Login/Register Footer

File:

- `theme/Xboard/dashboard.blade.php`

Pattern used:

- `shouldShow()` decides whether the current route is login/register
- `syncFooter()` inserts or removes the footer based on the latest route
- the script runs on `DOMContentLoaded`, `hashchange`, `popstate`, and `setInterval`

Why this works:

- If the user logs in and the SPA reuses the shell, the polling loop still notices that the current route is no longer login/register and removes the footer

### Dashboard Welcome Modal

Files:

- `public/vvcloud-custom/vvcloud-dashboard-welcome.css`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.js`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.v2.css`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.v2.js`
- `theme/Xboard/dashboard.blade.php`

Pattern used:

- `syncModalWithRoute()` watches whether the app has entered the dashboard
- it only triggers the modal when route state moves from non-dashboard to dashboard
- it resets state when leaving the dashboard, so returning later can trigger the modal again
- it also uses `DOMContentLoaded`, `hashchange`, `popstate`, and interval polling

Why route-edge logic matters:

- If the user closes the modal while staying on the dashboard, it should not immediately reopen
- If the user leaves the dashboard and comes back later, it should be allowed to show again

## User Info / Plan Gate Pattern

For the welcome modal, we later reintroduced a condition:

- only show the modal when `GET /api/v1/user/info` returns `plan_id === 1`

Important implementation details:

1. Do not fetch user info every poll cycle
   Fetch only when entering the dashboard.
2. Reuse the same auth shape as the frontend theme
   The current Xboard theme stores the access token in local storage under:
   - `VUE_NAIVE_ACCESS_TOKEN`
3. Reuse `window.routerBase`
   Build API URLs from `window.routerBase`, not from hardcoded assumptions about deployment paths.

This avoids both unnecessary traffic and incorrect auth assumptions.

## Mobile Layout Lesson

When we expanded the modal action area from three buttons to four buttons, the desktop layout was still fine, but the mobile layout broke.

Root cause:

- desktop buttons used `flex: 1 1 200px`
- on mobile the action container switched to column layout
- in a column flex layout, `200px` becomes a height basis, not a width basis

Fix:

- in the mobile breakpoint, override buttons with:
  - `flex: none`
  - `width: 100%`

## CDN Cache / Asset Versioning Lesson

When these custom assets changed frequently, CDN/browser cache delayed rollout.

The safe pattern is:

1. create a new asset filename, for example:
   - `vvcloud-dashboard-welcome.v2.css`
   - `vvcloud-dashboard-welcome.v2.js`
2. update the template reference to the new filename
3. keep the old filename present with the same latest content if you still want backward compatibility or easier rollback

This lets you bypass stale CDN caches without waiting for propagation.

## Practical Checklist

Before adding any route-scoped custom UI in Xboard:

1. Assume route changes are SPA transitions, not reloads.
2. Do not rely on `DOMContentLoaded` alone.
3. Add a route-sync function plus event listeners and a polling fallback.
4. If the UI should show only when entering a route, track previous route state.
5. If the UI depends on user state, fetch only on route entry, not continuously.
6. Reuse the theme's real auth storage key and `routerBase`.
7. Test both:
   - fresh reload on target route
   - in-app navigation into and out of the route
8. Re-check mobile flex behavior after adding more buttons or cards.
9. If urgent rollout matters, version asset filenames to defeat CDN cache.

## Related Files

- `theme/Xboard/dashboard.blade.php`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.css`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.js`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.v2.css`
- `public/vvcloud-custom/vvcloud-dashboard-welcome.v2.js`
