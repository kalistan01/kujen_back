const mongoose = require("mongoose");
const { AssignLorry, Lorry, Destination } = require("../models");
const { formatFclRecord } = require("../lib/fcl");

const ASSIGNMENT_FIELDS = [
  ["blNo", "BL number"],
  ["cusdecDate", "Cusdec date"],
  ["cusdecNo", "Cusdec number"],
  ["regNo", "Registration number"],
  ["item", "Item"],
  ["exporter", "Exporter"],
  ["importer", "Importer"],
];

const CONTAINER_FIELDS = [
  ["containerNo", "Container"],
  ["vocNo", "VOC"],
  ["lorryId", "Lorry"],
  ["loadingDate", "Loading date"],
  ["demoundDate", "Demount date"],
  ["destination", "Destination"],
  ["weight", "Weight"],
  ["dayHire", "Day hire"],
  ["advanced", "Advanced"],
  ["advancedDate", "Advanced date"],
  ["balancePaid", "Balance paid"],
  ["balanceDate", "Balance date"],
  ["outHire", "Out hire"],
  ["other", "Other"],
  ["heldUp", "Held up"],
  ["agentFee", "Agent fee"],
  ["transportCommission", "Transport commission"],
  ["return", "Return"],
  ["status", "Status"],
  ["fcl", "FCL status"],
  ["tripKind", "Trip"],
  ["sourceContainerId", "From yard container"],
];

const MONEY_KEYS = new Set([
  "weight",
  "dayHire",
  "advanced",
  "balancePaid",
  "outHire",
  "other",
  "heldUp",
  "agentFee",
  "transportCommission",
  "return",
]);

const DATE_KEYS = new Set([
  "cusdecDate",
  "loadingDate",
  "demoundDate",
  "advancedDate",
  "balanceDate",
]);

function assignmentIdFromRequest(req) {
  const url = String(req.originalUrl || req.path || "").split("?")[0];
  const match = url.match(/\/assignlorry\/([a-fA-F0-9]{24})/);
  return match?.[1] || null;
}

function containerIdFromRequest(req) {
  const url = String(req.originalUrl || req.path || "").split("?")[0];
  const match = url.match(/\/containers\/([a-fA-F0-9]{24})/);
  return match?.[1] || null;
}

function shouldLoadAssignment(req) {
  const url = String(req.originalUrl || "");
  if (!url.includes("/assignlorry")) return false;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return true;
  return req.method === "GET" && url.includes("/export/");
}

function idOf(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "—");
  const formatted =
    n % 1 === 0
      ? Math.abs(n).toLocaleString("en-LK")
      : Math.abs(n).toLocaleString("en-LK", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `Rs ${n < 0 ? "-" : ""}${formatted}`;
}

function formatDate(value) {
  if (!value) return "—";
  const str = String(value);
  const part = str.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
    const [year, month, day] = part.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function displayValue(value, key) {
  if (value === undefined || value === null || value === "") return "—";
  if (key === "lorryId") {
    if (typeof value === "object") {
      return value.lorryNum || idOf(value) || "—";
    }
    return String(value);
  }
  if (key === "destination") {
    if (typeof value === "object") {
      return (
        [value.type, value.location].filter(Boolean).join(" · ") ||
        idOf(value) ||
        "—"
      );
    }
    return String(value);
  }
  if (key === "fcl") return formatFclRecord(value);
  if (MONEY_KEYS.has(key)) return formatMoney(value);
  if (DATE_KEYS.has(key)) return formatDate(value);
  return String(value);
}

function sameValue(previous, next, key) {
  if (key === "lorryId" || key === "destination") {
    return idOf(previous) === idOf(next);
  }
  if (key === "fcl") return formatFclRecord(previous) === formatFclRecord(next);
  if (DATE_KEYS.has(key)) return formatDate(previous) === formatDate(next);
  if (MONEY_KEYS.has(key)) return Number(previous || 0) === Number(next || 0);
  return String(previous ?? "").trim() === String(next ?? "").trim();
}

function diffFields(previous, next, fields) {
  return fields
    .filter(([key]) => next[key] !== undefined)
    .filter(([key]) => !sameValue(previous?.[key], next[key], key))
    .map(
      ([key, label]) =>
        `Changed ${label} from ${displayValue(previous?.[key], key)} to ${displayValue(next[key], key)}`
    );
}

function containerRemaining(container) {
  const total = ["weight", "dayHire", "outHire", "other", "heldUp", "return"].reduce(
    (sum, key) => sum + Number(container?.[key] || 0),
    0
  );
  return (
    total -
    Number(container?.advanced || 0) -
    Number(container?.balancePaid || 0)
  );
}

async function resolveRefs(body) {
  const resolved = { ...body };
  const lorryId = idOf(body.lorryId);
  const destId = idOf(body.destination);
  if (lorryId && mongoose.Types.ObjectId.isValid(lorryId)) {
    const lorry = await Lorry.findById(lorryId).select("lorryNum capacity").lean();
    if (lorry) resolved.lorryId = lorry;
  }
  if (destId && mongoose.Types.ObjectId.isValid(destId)) {
    const dest = await Destination.findById(destId)
      .select("type location")
      .lean();
    if (dest) resolved.destination = dest;
  }
  return resolved;
}

async function loadPreviousAssignment(req) {
  const assignmentId = assignmentIdFromRequest(req);
  if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) return;
  const assignment = await AssignLorry.findById(assignmentId)
    .populate("containers.lorryId", "lorryNum capacity")
    .populate("containers.destination", "type location")
    .lean();
  req._previousAssignment = assignment || null;
  const containerId = containerIdFromRequest(req);
  if (assignment && containerId) {
    req._previousContainer =
      (assignment.containers || []).find(
        (container) => String(container._id) === containerId
      ) || null;
  }
}

function withBl(previous, body, text) {
  const blNo = body?.blNo || previous?.blNo;
  return blNo ? `BL ${blNo} · ${text}` : text;
}

async function assignmentChangeSummary(req, described) {
  const url = String(req.originalUrl || req.path || "").split("?")[0];
  const method = req.method;
  const body = req.body || {};
  const previous = req._previousAssignment;
  const previousContainer = req._previousContainer;

  if (method === "POST" && url.includes("/export/containers/pdf")) {
    const count = Array.isArray(body.containerIds) ? body.containerIds.length : 0;
    return {
      action: "Exported containers PDF",
      summary: count
        ? `Exported PDF for ${count} selected container${count === 1 ? "" : "s"}`
        : "Exported selected containers PDF",
    };
  }

  if (url.includes("/export/pdf")) {
    return {
      action: "Exported PDF",
      summary: withBl(previous, body, "Exported PDF"),
    };
  }
  if (url.includes("/export/excel")) {
    return {
      action: "Exported Excel",
      summary: withBl(previous, body, "Exported Excel"),
    };
  }

  if (method === "POST" && url.includes("/containers")) {
    const next = await resolveRefs(body);
    const parts = [
      `Added container ${displayValue(next.containerNo, "containerNo")}`,
      `Lorry ${displayValue(next.lorryId, "lorryId")}`,
      `Destination ${displayValue(next.destination, "destination")}`,
    ];
    if (next.loadingDate) {
      parts.push(`Loading ${displayValue(next.loadingDate, "loadingDate")}`);
    }
    if (next.dayHire !== undefined) {
      parts.push(`Day hire ${displayValue(next.dayHire, "dayHire")}`);
    }
    if (next.advanced !== undefined) {
      parts.push(`Advanced ${displayValue(next.advanced, "advanced")}`);
    }
    return {
      action: "Added container",
      summary: withBl(previous, body, parts.join(". ")),
    };
  }

  if (method === "PUT" && url.includes("/containers")) {
    const next = await resolveRefs(body);
    const changes = diffFields(previousContainer || {}, next, CONTAINER_FIELDS);
    const label =
      previousContainer?.containerNo || next.containerNo || "container";
    return {
      action: `Updated container ${label}`,
      summary: changes.length
        ? `${label}: ${changes.join(". ")}`
        : withBl(previous, body, `Updated container ${label}`),
    };
  }

  if (method === "PATCH" && url.includes("/pay-balances")) {
    const ids = Array.isArray(body.containerIds)
      ? body.containerIds.map(String)
      : [];
    const containers = (previous?.containers || []).filter((container) =>
      ids.includes(String(container._id))
    );
    const details = containers
      .map((container) => {
        const remaining = Math.max(0, containerRemaining(container));
        if (remaining <= 0) return null;
        return `${container.containerNo || "container"} ${formatMoney(remaining)}`;
      })
      .filter(Boolean);
    const date = formatDate(body.balanceDate);
    return {
      action: "Paid selected balances",
      summary: details.length
        ? `Paid remaining balances${date !== "—" ? ` on ${date}` : ""}: ${details.join(", ")}`
        : withBl(
            previous,
            body,
            `Paid ${ids.length} container balance${ids.length === 1 ? "" : "s"}`
          ),
    };
  }

  if (method === "PATCH" && url.includes("/balance")) {
    const remaining = Math.max(0, containerRemaining(previousContainer || {}));
    const label = previousContainer?.containerNo || "container";
    const date = formatDate(body.balanceDate);
    return {
      action: "Paid container balance",
      summary: `Paid ${formatMoney(remaining)} remaining balance for ${label}${
        date !== "—" ? ` on ${date}` : ""
      }`,
    };
  }

  if (method === "PATCH" && url.includes("/containers")) {
    const label = previousContainer?.containerNo || "container";
    if (body.fcl !== undefined) {
      return {
        action: "Updated container FCL",
        summary: `${label}: FCL ${formatFclRecord(previousContainer?.fcl)} → ${formatFclRecord(body.fcl)}`,
      };
    }
    const from = previousContainer?.status || "—";
    const to = body.status || "—";
    return {
      action: "Updated container status",
      summary: `Changed status of ${label} from ${from} to ${to}`,
    };
  }

  if (method === "DELETE" && url.includes("/containers")) {
    const label = previousContainer?.containerNo || "container";
    return {
      action: "Removed container",
      summary: withBl(previous, body, `Removed container ${label}`),
    };
  }

  if (method === "POST") {
    const parts = [`Created assignment · BL ${body.blNo || "—"}`];
    if (body.item) parts.push(`Item ${body.item}`);
    if (body.exporter) parts.push(`Exporter ${body.exporter}`);
    if (body.importer) parts.push(`Importer ${body.importer}`);
    const containers = Array.isArray(body.containers) ? body.containers : [];
    if (containers.length) {
      const numbers = containers
        .map((container) => container.containerNo)
        .filter(Boolean)
        .join(", ");
      parts.push(
        `${containers.length} container${containers.length === 1 ? "" : "s"}${
          numbers ? `: ${numbers}` : ""
        }`
      );
    }
    return { action: "Created assignment", summary: parts.join(". ") };
  }

  if (method === "PATCH") {
    const changes = diffFields(previous || {}, body, ASSIGNMENT_FIELDS);
    return {
      action: "Updated assignment",
      summary: changes.length
        ? changes.join(". ")
        : withBl(previous, body, "Updated assignment details"),
    };
  }

  if (method === "DELETE") {
    return {
      action: "Deleted assignment",
      summary: `Deleted assignment · BL ${previous?.blNo || body.blNo || "—"}`,
    };
  }

  return { action: described.action, summary: described.action };
}

module.exports = {
  assignmentIdFromRequest,
  shouldLoadAssignment,
  loadPreviousAssignment,
  assignmentChangeSummary,
};
