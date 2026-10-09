// Client-side dogfooding telemetry.
// Non-blocking telemetry sent to /api/telemetry for real-time live debugging.

const sessionId = Math.random().toString(36).slice(2, 9);
let lastLocation = null;
let lastExhibitId = null;
let lastFpsLog = 0;

export function logEvent(type, data = {}) {
  const payload = {
    sessionId,
    type,
    ...data,
  };
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/telemetry', blob)) return;
    }
    fetch('/api/telemetry', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Fail silently in client
  }
}

export function logLocationChange(region) {
  const key = region?.id ?? 'lobby';
  if (key === lastLocation) return;
  lastLocation = key;
  logEvent('location_change', {
    region: key,
    label: region?.label ?? 'Between rooms',
  });
}

export function logExhibitView(ex) {
  const id = ex?.project?.id ?? null;
  if (id === lastExhibitId) return;
  lastExhibitId = id;
  if (!ex) {
    logEvent('exhibit_close');
    return;
  }
  logEvent('exhibit_view', {
    id: ex.project.id,
    name: ex.project.name,
    wing: ex.wing?.id ?? ex.project.wing,
    years: ex.project.years,
    status: ex.project.status,
  });
}

export function logLeverPull() {
  logEvent('lever_pull');
}

export function logQualityChange(quality) {
  logEvent('quality_change', { quality });
}

export function logPerfDrop(fps, preset) {
  const now = performance.now();
  if (now - lastFpsLog < 5000) return; // limit drops to once per 5s
  lastFpsLog = now;
  logEvent('perf_drop', { fps: Math.round(fps), quality: preset });
}

export function initTelemetry() {
  window.addEventListener('error', (e) => {
    logEvent('error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    logEvent('unhandledrejection', {
      message: String(e.reason?.message || e.reason),
      stack: e.reason?.stack,
    });
  });

  logEvent('session_start', {
    screen: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    url: window.location.href,
  });
}
