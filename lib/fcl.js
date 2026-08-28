const STEP_KEYS = ["received", "submitted", "paymentReceived"];

const STEP_LABELS = {
  received: "Received",
  submitted: "Submitted to shipping line",
  paymentReceived: "FCL payment received",
};

function emptyStep() {
  return { done: false, date: null };
}

function emptyFcl() {
  return {
    enabled: false,
    received: emptyStep(),
    submitted: emptyStep(),
    paymentReceived: emptyStep(),
  };
}

function isDone(step) {
  return Boolean(step?.done);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function normalizeStep(step, today) {
  if (!isDone(step)) return emptyStep();
  return {
    done: true,
    date: parseDate(step?.date) || today,
  };
}

function normalizeFcl(value) {
  if (!value || typeof value !== "object" || !value.enabled) {
    return emptyFcl();
  }
  const today = new Date();
  const received = normalizeStep(value.received, today);
  const submitted = received.done
    ? normalizeStep(value.submitted, today)
    : emptyStep();
  const paymentReceived = submitted.done
    ? normalizeStep(value.paymentReceived, today)
    : emptyStep();
  return {
    enabled: true,
    received,
    submitted,
    paymentReceived,
  };
}

function fclOrderError(value) {
  if (!value || typeof value !== "object" || !value.enabled) return null;
  if (isDone(value.submitted) && !isDone(value.received)) {
    return "FCL must be received before it can be submitted to the shipping line.";
  }
  if (isDone(value.paymentReceived) && !isDone(value.submitted)) {
    return "FCL must be submitted to the shipping line before payment can be recorded.";
  }
  if (isDone(value.paymentReceived) && !isDone(value.received)) {
    return "FCL must be received before payment can be recorded.";
  }
  return null;
}

function applyFclToContainer(container) {
  const error = fclOrderError(container?.fcl);
  if (error) return { error };
  return { fcl: normalizeFcl(container?.fcl) };
}

function currentFclStatus(value) {
  const fcl = normalizeFcl(value);
  if (!fcl.enabled) {
    return { key: "", label: "—", date: "" };
  }
  for (let i = STEP_KEYS.length - 1; i >= 0; i -= 1) {
    const key = STEP_KEYS[i];
    if (fcl[key].done) {
      return {
        key,
        label: STEP_LABELS[key],
        date: formatDate(fcl[key].date),
      };
    }
  }
  return { key: "pending", label: "Pending", date: "" };
}

function formatFclStatus(value) {
  const current = currentFclStatus(value);
  if (!current.key) return "—";
  if (!current.date) return current.label;
  return `${current.label} · ${current.date}`;
}

function formatFclRecord(value) {
  const fcl = normalizeFcl(value);
  if (!fcl.enabled) return "—";
  const parts = STEP_KEYS.filter((key) => fcl[key].done).map((key) => {
    const date = formatDate(fcl[key].date);
    return date ? `${STEP_LABELS[key]} · ${date}` : STEP_LABELS[key];
  });
  return parts.length ? parts.join(" → ") : "Pending";
}

module.exports = {
  emptyFcl,
  normalizeFcl,
  fclOrderError,
  applyFclToContainer,
  currentFclStatus,
  formatFclStatus,
  formatFclRecord,
};
