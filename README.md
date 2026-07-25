# SkyChefs Airlines On Time Performance

Branded static SkyChefs flight delay dashboard.

- `index.html` provides the approved SkyChefs brand treatment and responsive page shell.
- `dashboard.html` contains the interactive analytical dashboard.
- `assets/dashboard-data.js` contains the pre-aggregated monthly and weekly snapshot.
- `assets/dashboard-app.js` drives the location, airline, and time-view filters plus the trend charts and tables.
- `assets/hourly-app.js` drives the hourly metric and period controls.
- `assets/hourly-data-YYYY-MM.js` files contain lazily loaded daily/hourly aggregates for single-day, date-range, and monthly views.
- `assets/SkyChefs-logo-approved.svg` is the unmodified approved logo asset.

The data is a static snapshot through July 20, 2026. On-time performance means less than 15 minutes late. It is not a live connection.
