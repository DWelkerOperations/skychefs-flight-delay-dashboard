# SkyChefs Airlines On Time Performance

Branded static SkyChefs flight delay dashboard.

- `index.html` provides the approved SkyChefs brand treatment and responsive page shell.
- `dashboard.html` contains the interactive analytical dashboard.
- `assets/dashboard-data.js` contains the pre-aggregated monthly and weekly snapshot.
- `assets/dashboard-app.js` drives the location, airline, and time-view filters plus the trend charts and tables.
- `assets/hourly-app.js` drives the hourly average-delay chart and period controls.
- `assets/view-app.js` separates the default delay-trend view from the scheduled-hour analysis.
- `assets/hourly-data-YYYY-MM.js` files contain lazily loaded daily/hourly aggregates for single-day, date-range, weekly-average, and monthly-average views.
- `assets/SkyChefs-logo-approved.svg` is the unmodified approved logo asset.

The default **Delay trends** view keeps the arrival and departure 30+, 60+, and 90+ minute line charts visible and scopes the Monthly/Weekly selector to those charts. The separate **By scheduled hour** view compares volume-weighted average arrival and departure delay by scheduled local hour, with monthly-average, weekly-average, single-day, and date-range alternatives. Exact tables are available in expandable sections.

The data is a static snapshot through July 20, 2026. Average hourly delay is total valid delay minutes divided by valid movements; positive values are late and negative values are early. It is not a live connection.
