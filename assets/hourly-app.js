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
  const minimumChartObservations = 10;
  const loadedMonths = new Map();
  const assetVersion = String(window.SKY_CHEFS_ASSET_VERSION || "").trim();
  const assetVersionQuery = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
  let renderVersion = 0;
  let comparisonRenderVersion = 0;

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
  const comparisonMarkerTypes = ["circle", "square", "triangle", "diamond", "circle", "square"];

  const locationSelect = document.getElementById("location-filter");
  const airlineSelect = document.getElementById("airline-filter");
  const periodSelect = document.getElementById("hourly-period-mode");
  const monthSelect = document.getElementById("hourly-month");
  const weekSelect = document.getElementById("hourly-week");
  const dayInput = document.getElementById("hourly-day");
  const rangeStartInput = document.getElementById("hourly-range-start");
  const rangeEndInput = document.getElementById("hourly-range-end");
  const status = document.getElementById("hourly-status");
  const comparisonMonthContainer = document.getElementById("arrival-comparison-months");
  const comparisonStatus = document.getElementById("arrival-comparison-status");
  const comparisonInputs = [];
  const latestMonth = data.months[data.months.length - 1];

  [dayInput, rangeStartInput, rangeEndInput].forEach((input) => {
    input.min = data.start;
    input.max = data.end;
  });
  dayInput.value = data.end;
  rangeStartInput.value = latestMonth ? latestMonth.s : data.start;
  rangeEndInput.value = data.end;

  data.months.forEach((period) => {
    const option = document.createElement("option");
    option.value = period.s.slice(0, 7);
    option.textContent = `${period.l} 2026${period.p ? " (partial)" : ""}`;
    monthSelect.appendChild(option);
  });
  monthSelect.value = data.months.some((period) => period.s.startsWith("2026-06"))
    ? "2026-06"
    : data.months[0].s.slice(0, 7);

  const defaultComparisonMonths = new Set(
    data.months
      .filter((period) => !period.p)
      .slice(-2)
      .map((period) => period.s.slice(0, 7))
  );
  data.months.forEach((period, index) => {
    const month = period.s.slice(0, 7);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "arrival-comparison-month";
    input.value = month;
    input.id = `arrival-comparison-${month}`;
    input.checked = defaultComparisonMonths.has(month);

    const label = document.createElement("label");
    label.className = `month-checkbox-label month-color-${index}`;
    label.htmlFor = input.id;

    const keySymbol = comparisonKeySymbol(index);

    const text = document.createElement("span");
    text.textContent = comparisonMonthLabel(period);

    label.append(input, keySymbol, text);
    comparisonMonthContainer.appendChild(label);
    comparisonInputs.push(input);
  });

  data.weeks.forEach((period) => {
    const option = document.createElement("option");
    option.value = period.s;
    option.textContent = `${period.l}, 2026${period.p ? " (partial)" : ""}`;
    weekSelect.appendChild(option);
  });
  const defaultWeek = [...data.weeks].reverse().find((period) => !period.p)
    || data.weeks[data.weeks.length - 1];
  weekSelect.value = defaultWeek.s;

  function periodMode() {
    return periodSelect.value;
  }

  function syncPeriodControls() {
    const mode = periodMode();
    document.getElementById("hourly-month-control").hidden = mode !== "month";
    document.getElementById("hourly-week-control").hidden = mode !== "week";
    document.getElementById("hourly-day-control").hidden = mode !== "day";
    document.getElementById("hourly-range-control").hidden = mode !== "range";
  }

  function dateFromIso(isoDate) {
    return new Date(`${isoDate}T12:00:00`);
  }

  function comparisonMonthLabel(period) {
    const year = dateFromIso(period.s).getFullYear();
    return `${period.l} ${year}${period.p ? " (partial)" : ""}`;
  }

  function comparisonKeySymbol(index) {
    const colorClass = `month-color-${index}`;
    const className = `comparison-series ${colorClass}`;
    const svg = svgElement("svg", {
      viewBox: "0 0 38 18",
      class: "month-checkbox-key trend-chart",
      "aria-hidden": "true",
      focusable: "false",
    });
    const line = svgElement("path", {
      d: "M2,9 L36,9",
      class: `series-line ${className}`,
    });
    const marker = markerNode({
      className,
      marker: comparisonMarkerTypes[index % comparisonMarkerTypes.length],
    }, 19, 9);
    svg.append(line, marker);
    return svg;
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
    if (mode === "week") {
      const week = data.weeks.find((period) => period.s === weekSelect.value);
      return {
        start: week.s,
        end: week.e,
        label: `${week.l}, 2026${week.p ? " (partial)" : ""}`,
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
      script.src = `assets/hourly-data-${month}.js${assetVersionQuery}`;
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
    return Array.from({ length: 24 }, () => [0, 0, 0, 0, 0, 0, 0]);
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
          const [slot, scheduled, valid, onTime, delay30, delay60, delay90, delaySum] = row;
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
          bucket[6] += delaySum;
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

  function averageDelay(counts) {
    return counts[1] > 0 ? counts[6] / counts[1] : null;
  }

  function chartAverageDelay(counts) {
    return counts[1] >= minimumChartObservations ? averageDelay(counts) : null;
  }

  function formatDelay(value) {
    if (value === null) {
      return "—";
    }
    const rounded = Math.abs(value) < 0.05 ? 0 : value;
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded).toFixed(1)} min`;
  }

  function formatAxisMinutes(value) {
    const rounded = Math.abs(value) < 0.0001 ? 0 : value;
    const digits = Number.isInteger(rounded) ? 0 : 1;
    const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
    return `${sign}${Math.abs(rounded).toFixed(digits)}`;
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

  function niceStep(range, targetTicks = 5) {
    const rough = Math.max(range, 1) / targetTicks;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const residual = rough / magnitude;
    const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
    return factor * magnitude;
  }

  function delayDomain(values) {
    const observed = values.filter((value) => value !== null);
    if (!observed.length) {
      return { min: 0, max: 10, step: 2 };
    }

    const rawMin = Math.min(0, ...observed);
    const rawMax = Math.max(0, ...observed);
    const rawRange = Math.max(rawMax - rawMin, 5);
    const padding = Math.max(rawRange * 0.08, 1);
    const paddedMin = rawMin < 0 ? rawMin - padding : 0;
    const paddedMax = rawMax > 0 ? rawMax + padding : 0;
    const step = niceStep(Math.max(paddedMax - paddedMin, 5));
    const min = Math.floor(paddedMin / step) * step;
    let max = Math.ceil(paddedMax / step) * step;
    if (max <= min) {
      max = min + step;
    }
    return { min, max, step };
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
    if (definition.marker === "triangle") {
      return svgElement("path", {
        d: `M${x},${y - 5} L${x + 5},${y + 4} L${x - 5},${y + 4} Z`,
        class: `marker ${definition.className}`,
      });
    }
    if (definition.marker === "diamond") {
      return svgElement("path", {
        d: `M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} Z`,
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

  function showTooltip(event, definition, hour, value, valid) {
    const wrap = document.getElementById("hourly-chart-wrap");
    const tooltip = document.getElementById("hourly-tooltip");
    const wrapRect = wrap.getBoundingClientRect();
    const markRect = event.currentTarget.getBoundingClientRect();
    tooltip.innerHTML = `<strong>${hourLabel(hour)} · ${definition.label}</strong><br>${formatDelay(value)} average delay<br>${countFormat.format(valid)} valid movements`;
    tooltip.hidden = false;
    const x = markRect.left - wrapRect.left + markRect.width / 2;
    const y = markRect.top - wrapRect.top;
    tooltip.style.left = `${Math.max(95, Math.min(wrapRect.width - 95, x))}px`;
    tooltip.style.top = `${Math.max(74, y)}px`;
  }

  function hideTooltip() {
    document.getElementById("hourly-tooltip").hidden = true;
  }

  function showComparisonTooltip(event, html) {
    const wrap = document.getElementById("arrival-comparison-chart-wrap");
    const tooltip = document.getElementById("arrival-comparison-tooltip");
    const wrapRect = wrap.getBoundingClientRect();
    const markRect = event.currentTarget.getBoundingClientRect();
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const x = markRect.left - wrapRect.left + markRect.width / 2;
    const y = markRect.top - wrapRect.top;
    tooltip.style.left = `${Math.max(100, Math.min(wrapRect.width - 100, x))}px`;
    tooltip.style.top = `${Math.max(74, y)}px`;
  }

  function hideComparisonTooltip() {
    document.getElementById("arrival-comparison-tooltip").hidden = true;
  }

  function renderArrivalComparisonChart(monthSeries) {
    const title = "Monthly Arrival Delay Comparison";
    const scopeLocation = locationSelect.value === "all" ? "all locations" : locationSelect.value;
    const scopeAirline = airlineSelect.value === "all" ? "all airlines" : airlineSelect.value;
    const subtitle = `${scopeLocation} · ${scopeAirline} · arrivals only · positive is late; negative is early · lines require 10+ valid arrivals per hour.`;
    document.getElementById("arrival-comparison-chart-title").textContent = title;
    document.getElementById("arrival-comparison-chart-subtitle").textContent = subtitle;

    const svg = document.getElementById("arrival-comparison-chart");
    svg.replaceChildren();
    const titleNode = svgElement("title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);

    const selectedLabels = monthSeries.map((seriesDefinition) => comparisonMonthLabel(seriesDefinition.period));
    const descNode = svgElement("desc");
    descNode.textContent = monthSeries.length
      ? `Average arrival delay in minutes across 24 scheduled local hours for ${selectedLabels.join(", ")}. Each selected month is a separate line. Positive values are late and negative values are early. Plotted points require at least 10 valid arrivals.`
      : "No months are selected. Select one or more months to compare average arrival delay by scheduled hour.";
    svg.appendChild(descNode);
    document.getElementById("arrival-comparison-chart-desc").textContent = descNode.textContent;

    const width = 960;
    const height = 340;
    const margin = { top: 18, right: 58, bottom: 54, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xScale = (hour) => margin.left + hour * innerWidth / 23;

    if (!monthSeries.length) {
      appendText(svg, "Select one or more months to compare", width / 2, height / 2, "no-data", "middle");
      return;
    }

    const allAverages = monthSeries.flatMap((seriesDefinition) => (
      seriesDefinition.hours.map(chartAverageDelay)
    ));
    const domain = delayDomain(allAverages);
    const yScale = (value) => (
      margin.top + (domain.max - value) * innerHeight / (domain.max - domain.min)
    );

    const tickCount = Math.round((domain.max - domain.min) / domain.step);
    for (let tick = 0; tick <= tickCount; tick += 1) {
      const value = domain.min + domain.step * tick;
      const y = yScale(value);
      svg.appendChild(svgElement("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: Math.abs(value) < 0.0001 ? "zero-line" : "grid-line",
      }));
      appendText(svg, formatAxisMinutes(value), margin.left - 10, y + 4, "axis-label", "end");
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

    appendText(svg, "Average arrival delay (minutes)", 14, margin.top + innerHeight / 2, "axis-label", "middle")
      .setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);

    const hasData = allAverages.some((value) => value !== null);
    if (!hasData) {
      appendText(svg, "No valid arrivals for the selected months", width / 2, height / 2, "no-data", "middle");
      return;
    }

    monthSeries.forEach((seriesDefinition) => {
      const colorClass = `month-color-${seriesDefinition.colorIndex}`;
      const className = `comparison-series ${colorClass}`;
      const markerDefinition = {
        className,
        marker: comparisonMarkerTypes[seriesDefinition.colorIndex % comparisonMarkerTypes.length],
      };
      const averages = seriesDefinition.hours.map(chartAverageDelay);
      svg.appendChild(svgElement("path", {
        d: linePath(averages, xScale, yScale),
        class: `series-line ${className}`,
      }));

      averages.forEach((value, hour) => {
        if (value === null) {
          return;
        }
        const valid = seriesDefinition.hours[hour][1];
        const label = comparisonMonthLabel(seriesDefinition.period);
        const marker = markerNode(markerDefinition, xScale(hour), yScale(value));
        const accessible = `${hourLabel(hour)}, ${label}, average arrival delay: ${formatDelay(value)}, ${countFormat.format(valid)} valid arrivals.`;
        marker.setAttribute("aria-label", accessible);
        const markerTitle = svgElement("title");
        markerTitle.textContent = accessible;
        marker.appendChild(markerTitle);
        marker.addEventListener("pointerenter", (event) => {
          showComparisonTooltip(
            event,
            `<strong>${hourLabel(hour)} · ${label}</strong><br>${formatDelay(value)} average arrival delay<br>${countFormat.format(valid)} valid arrivals`
          );
        });
        marker.addEventListener("pointerleave", hideComparisonTooltip);
        svg.appendChild(marker);
      });
    });
  }

  function renderChart(arrivals, departures, selection) {
    const title = "Average Delay by Scheduled Hour";
    const scopeLocation = locationSelect.value === "all" ? "all locations" : locationSelect.value;
    const scopeAirline = airlineSelect.value === "all" ? "all airlines" : airlineSelect.value;
    const subtitle = `${selection.label} · ${scopeLocation} · ${scopeAirline} · positive is late; negative is early · lines require 10+ valid movements per hour.`;
    document.getElementById("hourly-chart-title").textContent = title;
    document.getElementById("hourly-chart-subtitle").textContent = subtitle;

    const svg = document.getElementById("hourly-chart");
    svg.replaceChildren();
    const titleNode = svgElement("title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);
    const descNode = svgElement("desc");
    descNode.textContent = `Average arrival and departure delay in minutes across 24 scheduled local hours for ${selection.label}. Positive values are late and negative values are early. Plotted points require at least 10 valid movements; the table includes every hour.`;
    svg.appendChild(descNode);
    document.getElementById("hourly-chart-desc").textContent = descNode.textContent;

    const width = 960;
    const height = 340;
    const margin = { top: 18, right: 58, bottom: 54, left: 58 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xScale = (hour) => margin.left + hour * innerWidth / 23;
    const allAverages = [
      ...arrivals.map(chartAverageDelay),
      ...departures.map(chartAverageDelay),
    ];
    const domain = delayDomain(allAverages);
    const yScale = (value) => (
      margin.top + (domain.max - value) * innerHeight / (domain.max - domain.min)
    );

    const tickCount = Math.round((domain.max - domain.min) / domain.step);
    for (let tick = 0; tick <= tickCount; tick += 1) {
      const value = domain.min + domain.step * tick;
      const y = yScale(value);
      svg.appendChild(svgElement("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: Math.abs(value) < 0.0001 ? "zero-line" : "grid-line",
      }));
      appendText(svg, formatAxisMinutes(value), margin.left - 10, y + 4, "axis-label", "end");
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

    appendText(svg, "Average delay (minutes)", 14, margin.top + innerHeight / 2, "axis-label", "middle")
      .setAttribute("transform", `rotate(-90 14 ${margin.top + innerHeight / 2})`);

    const hasData = allAverages.some((value) => value !== null);
    if (!hasData) {
      appendText(svg, "No valid movements for this selection", width / 2, height / 2, "no-data", "middle");
      return;
    }

    directionDefinitions.forEach((definition) => {
      const values = definition.code === "a" ? arrivals : departures;
      const averages = values.map(chartAverageDelay);
      svg.appendChild(svgElement("path", {
        d: linePath(averages, xScale, yScale),
        class: `series-line ${definition.className}`,
      }));

      averages.forEach((value, hour) => {
        if (value === null) {
          return;
        }
        const counts = values[hour];
        const valid = counts[1];
        const marker = markerNode(definition, xScale(hour), yScale(value));
        const accessible = `${hourLabel(hour)}, ${definition.label}, average delay: ${formatDelay(value)}, ${countFormat.format(valid)} valid movements.`;
        marker.setAttribute("aria-label", accessible);
        const markerTitle = svgElement("title");
        markerTitle.textContent = accessible;
        marker.appendChild(markerTitle);
        marker.addEventListener("pointerenter", (event) => {
          showTooltip(event, definition, hour, value, valid);
        });
        marker.addEventListener("pointerleave", hideTooltip);
        svg.appendChild(marker);
      });
    });
  }

  function renderTable(arrivals, departures) {
    const body = document.getElementById("hourly-table-body");
    body.replaceChildren();

    for (let hour = 0; hour < 24; hour += 1) {
      const arrival = arrivals[hour];
      const departure = departures[hour];
      const row = document.createElement("tr");
      const values = [
        hourLabel(hour),
        formatDelay(averageDelay(arrival)),
        countFormat.format(arrival[1]),
        formatPct(pct(arrival[1], arrival[0])),
        formatDelay(averageDelay(departure)),
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

  async function renderArrivalComparison() {
    const version = ++comparisonRenderVersion;
    comparisonStatus.classList.remove("is-error");
    const selectedMonths = comparisonInputs
      .filter((input) => input.checked)
      .map((input) => {
        const period = data.months.find((candidate) => candidate.s.startsWith(input.value));
        return {
          month: input.value,
          period,
          colorIndex: data.months.indexOf(period),
        };
      });

    if (!selectedMonths.length) {
      comparisonStatus.textContent = "Select one or more months to compare arrival performance.";
      renderArrivalComparisonChart([]);
      window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      return;
    }

    comparisonStatus.textContent = `Loading ${selectedMonths.length} selected ${selectedMonths.length === 1 ? "month" : "months"}…`;
    try {
      const payloads = await Promise.all(selectedMonths.map((selection) => loadMonth(selection.month)));
      if (version !== comparisonRenderVersion) {
        return;
      }
      const monthSeries = selectedMonths.map((selection, index) => ({
        ...selection,
        hours: aggregateDirection(
          [payloads[index]],
          [selection.month],
          { start: selection.period.s, end: selection.period.e },
          "a"
        ),
      }));
      renderArrivalComparisonChart(monthSeries);

      const scopeLocation = locationSelect.value === "all" ? "All locations" : locationSelect.value;
      const scopeAirline = airlineSelect.value === "all" ? "All airlines" : airlineSelect.value;
      comparisonStatus.textContent = `${selectedMonths.length} ${selectedMonths.length === 1 ? "month" : "months"} selected · ${scopeLocation} · ${scopeAirline} · partial months are labeled`;
      window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    } catch (loadError) {
      if (version !== comparisonRenderVersion) {
        return;
      }
      comparisonStatus.textContent = loadError.message;
      comparisonStatus.classList.add("is-error");
    }
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
      renderChart(arrivals, departures, selection);
      renderTable(arrivals, departures);

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

  periodSelect.addEventListener("change", renderHourly);
  monthSelect.addEventListener("change", renderHourly);
  weekSelect.addEventListener("change", renderHourly);
  dayInput.addEventListener("change", renderHourly);
  rangeStartInput.addEventListener("change", renderHourly);
  rangeEndInput.addEventListener("change", renderHourly);
  comparisonInputs.forEach((input) => input.addEventListener("change", renderArrivalComparison));
  locationSelect.addEventListener("change", () => {
    renderHourly();
    renderArrivalComparison();
  });
  airlineSelect.addEventListener("change", () => {
    renderHourly();
    renderArrivalComparison();
  });

  syncPeriodControls();
  renderHourly();
  renderArrivalComparison();
})();
