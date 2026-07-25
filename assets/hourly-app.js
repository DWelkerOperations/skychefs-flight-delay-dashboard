(() => {
  "use strict";

  const data = window.SKY_CHEFS_DASHBOARD_DATA;
  if (!data) {
    return;
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const countFormat = new Intl.NumberFormat("en-US");
  const displayDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const loadedMonths = new Map();
  let renderVersion = 0;

  const metricDefinitions = {
    otp: {
      label: "On-time performance",
      shortLabel: "on time",
      numeratorIndex: 2,
      fixedScale: true,
    },
    d30: {
      label: "30+ minute delay rate",
      shortLabel: "30+ min",
      numeratorIndex: 3,
      fixedScale: false,
    },
    d60: {
      label: "60+ minute delay rate",
      shortLabel: "60+ min",
      numeratorIndex: 4,
      fixedScale: false,
    },
    d90: {
      label: "90+ minute delay rate",
      shortLabel: "90+ min",
      numeratorIndex: 5,
      fixedScale: false,
    },
  };

  const directionDefinitions = [
    {
      code: "a",
      label: "Arrivals",
      noun: "arrivals",
      className: "series-arrival",
      marker: "circle",
    },
    {
      code: "d",
      label: "Departures",
      noun: "departures",
      className: "series-departure",
      marker: "square",
    },
  ];

  const locationSelect = document.getElementById("location-filter");
  const airlineSelect = document.getElementById("airline-filter");
  const metricSelect = document.getElementById("hourly-metric");
  const periodInputs = Array.from(document.querySelectorAll('input[name="hourly-period"]'));
  const monthSelect = document.getElementById("hourly-month");
  const dayInput = document.getElementById("hourly-day");
  const rangeStartInput = document.getElementById("hourly-range-start");
  const rangeEndInput = document.getElementById("hourly-range-end");
  const status = document.getElementById("hourly-status");

  data.months.forEach((period) => {
    const option = document.createElement("option");
    option.value = period.s.slice(0, 7);
    option.textContent = `${period.l} 2026${period.p ? " (partial)" : ""}`;
    monthSelect.appendChild(option);
  });
  monthSelect.value = data.months.some((period) => period.s.startsWith("2026-06"))
    ? "2026-06"
    : data.months[0].s.slice(0, 7);

  function periodMode() {
    return periodInputs.find((input) => input.checked)?.value || "month";
  }

  function syncPeriodControls() {
    const mode = periodMode();
    document.getElementById("hourly-month-control").hidden = mode !== "month";
    document.getElementById("hourly-day-control").hidden = mode !== "day";
    document.getElementById("hourly-range-control").hidden = mode !== "range";
  }

  function dateFromIso(isoDate) {
    return new Date(`${isoDate}T12:00:00`);
  }

  function periodSelection() {
    const mode = periodMode();
    if (mode === "day") {
      return {
        start: dayInput.value,
        end: dayInput.value,
        label: displayDate.format(dateFromIso(dayInput.value)),
        mode,
      };
    }
    if (mode === "range") {
      const start = rangeStartInput.value;
      const end = rangeEndInput.value;
      return {
        start,
        end,
        label: `${displayDate.format(dateFromIso(start))}–${displayDate.format(dateFromIso(end))}`,
        mode,
      };
    }

    const month = data.months.find((period) => period.s.startsWith(monthSelect.value));
    return {
      start: month.s,
      end: month.e,
      label: `${month.l} 2026${month.p ? " (partial)" : ""}`,
      mode,
    };
  }

  function validateSelection(selection) {
    if (!selection.start || !selection.end) {
      return "Choose a valid date or date range.";
    }
    if (selection.start < data.start || selection.end > data.end) {
      return `Choose dates from ${data.start} through ${data.end}.`;
    }
    if (selection.start > selection.end) {
      return "The start date must be on or before the end date.";
    }
    return null;
  }

  function monthsForSelection(selection) {
    return data.months
      .map((period) => period.s.slice(0, 7))
      .filter((month) => month >= selection.start.slice(0, 7) && month <= selection.end.slice(0, 7));
  }

  function loadMonth(month) {
    window.SKY_CHEFS_HOURLY_DATA = window.SKY_CHEFS_HOURLY_DATA || {};
    if (window.SKY_CHEFS_HOURLY_DATA[month]) {
      return Promise.resolve(window.SKY_CHEFS_HOURLY_DATA[month]);
    }
    if (loadedMonths.has(month)) {
      return loadedMonths.get(month);
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `assets/hourly-data-${month}.js`;
      script.onload = () => resolve(window.SKY_CHEFS_HOURLY_DATA[month]);
      script.onerror = () => reject(new Error(`Hourly data for ${month} could not be loaded.`));
      document.head.appendChild(script);
    });
    loadedMonths.set(month, promise);
    return promise;
  }

  function pairMatches(pairKey) {
    const separator = pairKey.indexOf("|");
    const location = pairKey.slice(0, separator);
    const airline = pairKey.slice(separator + 1);
    return (locationSelect.value === "all" || location === locationSelect.value)
      && (airlineSelect.value === "all" || airline === airlineSelect.value);
  }

  function emptyHours() {
    return Array.from({ length: 24 }, () => [0, 0, 0, 0, 0, 0]);
  }

  function aggregateDirection(monthPayloads, months, selection, directionCode) {
    const hours = emptyHours();
    months.forEach((month, monthIndex) => {
      const pairs = monthPayloads[monthIndex][directionCode];
      Object.entries(pairs).forEach(([pairKey, rows]) => {
        if (!pairMatches(pairKey)) {
          return;
        }
        rows.forEach((row) => {
          const [slot, scheduled, valid, onTime, delay30, delay60, delay90] = row;
          const day = Math.floor(slot / 24) + 1;
          const hour = slot % 24;
          const isoDate = `${month}-${String(day).padStart(2, "0")}`;
          if (isoDate < selection.start || isoDate > selection.end) {
            return;
          }
          const bucket = hours[hour];
          bucket[0] += scheduled;
          bucket[1] += valid;
          bucket[2] += onTime;
          bucket[3] += delay30;
          bucket[4] += delay60;
          bucket[5] += delay90;
        });
      });
    });
    return hours;
  }

  function pct(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : null;
  }

  function formatPct(value) {
    return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
  }

  function hourLabel(hour) {
    const suffix = hour < 12 ? "AM" : "PM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${suffix}`;
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function appendText(svg, text, x, y, className, anchor = "start") {
    const node = svgElement("text", {
      x,
      y,
      class: className,
      "text-anchor": anchor,
    });
    node.textContent = text;
    svg.appendChild(node);
    return node;
  }

  function linePath(points, xScale, yScale) {
    let open = false;
    return points.map((value, index) => {
      if (value === null) {
        open = false;
        return "";
      }
      const command = open ? "L" : "M";
      open = true;
      return `${command}${xScale(index).toFixed(2)},${yScale(value).toFixed(2)}`;
    }).filter(Boolean).join(" ");
  }

  function niceCeiling(values) {
    const maximum = Math.max(0, ...values.filter((value) => value !== null));
    return Math.min(1, Math.max(0.1, Math.ceil(maximum * 20) / 20));
  }

  function markerNode(definition, x, y) {
    if (definition.marker === "square") {
      return svgElement("rect", {
        x: x - 4,
        y: y - 4,
        width: 8,
        height: 8,
        rx: 1,
        class: `marker ${definition.className}`,
      });
    }
    return svgElement("circle", {
      cx: x,
      cy: y,
      r: 4,
      class: `marker ${definition.className}`,
    });
  }

  function showTooltip(event, definition, hour, value, numerator, valid) {
    const wrap = document.getElementById("hourly-chart-wrap");
    const tooltip = document.getElementById("hourly-tooltip");
    const wrapRect = wrap.getBoundingClientRect();
    const markRect = event.currentTarget.getBoundingClientRect();
    tooltip.innerHTML = `<strong>${hourLabel(hour)} · ${definition.label}</strong><br>${formatPct(value)}<br>${countFormat.format(numerator)} of ${countFormat.format(valid)} valid`;
    tooltip.hidden = false;
    const x = markRect.left - wrapRect.left + markRect.width / 2;
    const y = markRect.top - wrapRect.top;
    tooltip.style.left = `${Math.max(95, Math.min(wrapRect.width - 95, x))}px`;
    tooltip.style.top = `${Math.max(74, y)}px`;
  }

  function hideTooltip() {
    document.getElementById("hourly-tooltip").hidden = true;
  }

  function renderChart(arrivals, departures, metric, selection) {
    const title = `${metric.label} by scheduled hour`;
    const scopeLocation = locationSelect.value === "all" ? "all locations" : locationSelect.value;
    const scopeAirline = airlineSelect.value === "all" ? "all airlines" : airlineSelect.value;
    const subtitle = `${selection.label} · ${scopeLocation} · ${scopeAirline} · rates use valid movements; review table volumes for low-sample hours.`;
    document.getElementById("hourly-chart-title").textContent = title;
    document.getElementById("hourly-chart-subtitle").textContent = subtitle;

    const svg = document.getElementById("hourly-chart");
    svg.replaceChildren();
    const titleNode = svgElement("title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);
    const descNode = svgElement("desc");
    descNode.textContent = `Arrival and departure ${metric.label.toLowerCase()} across 24 scheduled local hours for ${selection.label}.`;
    svg.appendChild(descNode);
    document.getElementById("hourly-chart-desc").textContent = descNode.textContent;

    const width = 960;
    const height = 340;
    const margin = { top: 18, right: 58, bottom: 54, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xScale = (hour) => margin.left + hour * innerWidth / 23;
    const allRates = [
      ...arrivals.map((counts) => pct(counts[metric.numeratorIndex], counts[1])),
      ...departures.map((counts) => pct(counts[metric.numeratorIndex], counts[1])),
    ];
    const yMax = metric.fixedScale ? 1 : niceCeiling(allRates);
    const yScale = (value) => margin.top + innerHeight - (value / yMax) * innerHeight;

    for (let tick = 0; tick <= 5; tick += 1) {
      const value = yMax * tick / 5;
      const y = yScale(value);
      svg.appendChild(svgElement("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: tick === 0 ? "axis-line" : "grid-line",
      }));
      appendText(svg, `${Math.round(value * 100)}%`, margin.left - 10, y + 4, "axis-label", "end");
    }

    [0, 3, 6, 9, 12, 15, 18, 21, 23].forEach((hour) => {
      const x = xScale(hour);
      svg.appendChild(svgElement("line", {
        x1: x,
        x2: x,
        y1: margin.top + innerHeight,
        y2: margin.top + innerHeight + 5,
        class: "axis-line",
      }));
      appendText(svg, hourLabel(hour).replace(":00 ", " "), x, margin.top + innerHeight + 24, "axis-label", "middle");
    });

    appendText(svg, "Percent of valid movements", 14, margin.top + innerHeight / 2, "axis-label", "middle")
      .setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);

    const hasData = allRates.some((value) => value !== null);
    if (!hasData) {
      appendText(svg, "No valid movements for this selection", width / 2, height / 2, "no-data", "middle");
      return;
    }

    directionDefinitions.forEach((definition) => {
      const values = definition.code === "a" ? arrivals : departures;
      const rates = values.map((counts) => pct(counts[metric.numeratorIndex], counts[1]));
      svg.appendChild(svgElement("path", {
        d: linePath(rates, xScale, yScale),
        class: `series-line ${definition.className}`,
      }));

      rates.forEach((value, hour) => {
        if (value === null) {
          return;
        }
        const counts = values[hour];
        const numerator = counts[metric.numeratorIndex];
        const valid = counts[1];
        const marker = markerNode(definition, xScale(hour), yScale(value));
        const accessible = `${hourLabel(hour)}, ${definition.label}, ${metric.shortLabel}: ${formatPct(value)}, ${countFormat.format(numerator)} of ${countFormat.format(valid)} valid.`;
        marker.setAttribute("aria-label", accessible);
        const markerTitle = svgElement("title");
        markerTitle.textContent = accessible;
        marker.appendChild(markerTitle);
        marker.addEventListener("pointerenter", (event) => {
          showTooltip(event, definition, hour, value, numerator, valid);
        });
        marker.addEventListener("pointerleave", hideTooltip);
        svg.appendChild(marker);
      });
    });
  }

  function renderTable(arrivals, departures, metric) {
    const body = document.getElementById("hourly-table-body");
    body.replaceChildren();
    document.getElementById("hourly-arrival-rate-heading").textContent = `Arrival ${metric.shortLabel}`;
    document.getElementById("hourly-departure-rate-heading").textContent = `Departure ${metric.shortLabel}`;

    for (let hour = 0; hour < 24; hour += 1) {
      const arrival = arrivals[hour];
      const departure = departures[hour];
      const arrivalRate = pct(arrival[metric.numeratorIndex], arrival[1]);
      const departureRate = pct(departure[metric.numeratorIndex], departure[1]);
      const row = document.createElement("tr");
      const values = [
        hourLabel(hour),
        arrivalRate === null
          ? "—"
          : `${countFormat.format(arrival[metric.numeratorIndex])} · ${formatPct(arrivalRate)}`,
        countFormat.format(arrival[1]),
        formatPct(pct(arrival[1], arrival[0])),
        departureRate === null
          ? "—"
          : `${countFormat.format(departure[metric.numeratorIndex])} · ${formatPct(departureRate)}`,
        countFormat.format(departure[1]),
        formatPct(pct(departure[1], departure[0])),
      ];
      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    }
  }

  function totalValid(hours) {
    return hours.reduce((sum, counts) => sum + counts[1], 0);
  }

  async function renderHourly() {
    const version = ++renderVersion;
    syncPeriodControls();
    status.classList.remove("is-error");
    const selection = periodSelection();
    const error = validateSelection(selection);
    if (error) {
      status.textContent = error;
      status.classList.add("is-error");
      return;
    }

    const months = monthsForSelection(selection);
    status.textContent = `Loading ${selection.label}…`;
    try {
      const payloads = await Promise.all(months.map(loadMonth));
      if (version !== renderVersion) {
        return;
      }
      const arrivals = aggregateDirection(payloads, months, selection, "a");
      const departures = aggregateDirection(payloads, months, selection, "d");
      const metric = metricDefinitions[metricSelect.value];
      renderChart(arrivals, departures, metric, selection);
      renderTable(arrivals, departures, metric);

      const scopeLocation = locationSelect.value === "all" ? "All locations" : locationSelect.value;
      const scopeAirline = airlineSelect.value === "all" ? "All airlines" : airlineSelect.value;
      status.textContent = `${selection.label} · ${scopeLocation} · ${scopeAirline} · ${countFormat.format(totalValid(arrivals))} valid arrivals · ${countFormat.format(totalValid(departures))} valid departures`;
    } catch (loadError) {
      if (version !== renderVersion) {
        return;
      }
      status.textContent = loadError.message;
      status.classList.add("is-error");
    }
  }

  metricSelect.addEventListener("change", renderHourly);
  periodInputs.forEach((input) => input.addEventListener("change", renderHourly));
  monthSelect.addEventListener("change", renderHourly);
  dayInput.addEventListener("change", renderHourly);
  rangeStartInput.addEventListener("change", renderHourly);
  rangeEndInput.addEventListener("change", renderHourly);
  locationSelect.addEventListener("change", renderHourly);
  airlineSelect.addEventListener("change", renderHourly);

  syncPeriodControls();
  renderHourly();
})();
