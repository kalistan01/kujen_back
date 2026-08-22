const mongoose = require("mongoose");
const { User, Role, LorryOwner, Lorry } = require("../models");

const PERMISSION_NAMES = {
  1: "View Users",
  2: "Manage Users",
  3: "View Lorry Owners",
  4: "Manage Lorry Owners",
  5: "Manage Assignments",
  6: "View Destinations",
  7: "Manage Destinations",
  8: "View Assignments",
  9: "Manage Roles",
  10: "View Logs",
  20: "Weight",
  21: "Day Hire",
  22: "Advanced",
  23: "Advanced Date",
  24: "Balance Paid",
  25: "Balance Date",
  26: "Out Hire",
  27: "Other",
  28: "Held Up",
  29: "Agent Fee",
  30: "Transport Commission",
  31: "Return",
  32: "Totals",
};

function idFromUrl(req, prefix) {
  const url = String(req.originalUrl || req.path || "").split("?")[0];
  const match = url.match(new RegExp(`/${prefix}/([a-fA-F0-9]{24})`));
  return match?.[1] || null;
}

function isTruthyStatus(value) {
  return value === true || value === 1 || value === "1" || value === "true";
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
  const part = String(value).substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
    const [year, month, day] = part.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function permissionLabel(id) {
  return PERMISSION_NAMES[Number(id)] || `Permission ${id}`;
}

function permissionDiff(previous, next) {
  const before = new Set((previous || []).map(Number));
  const after = new Set((next || []).map(Number));
  const granted = [...after].filter((id) => !before.has(id)).map(permissionLabel);
  const revoked = [...before].filter((id) => !after.has(id)).map(permissionLabel);
  const parts = [];
  if (granted.length) parts.push(`granted ${granted.join(", ")}`);
  if (revoked.length) parts.push(`revoked ${revoked.join(", ")}`);
  return parts;
}

async function roleNameById(roleId) {
  if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) return "";
  const role = await Role.findById(roleId).select("roleName").lean();
  return role?.roleName || "";
}

function userLabel(user, body = {}) {
  return (
    user?.fullName ||
    body.fullName ||
    user?.email ||
    body.email ||
    "user"
  );
}

function ownerLabel(owner, body = {}) {
  return (
    body.companyName ||
    owner?.companyName ||
    body.ownerName ||
    owner?.ownerName ||
    "lorry owner"
  );
}

async function loadPreviousEntities(req) {
  const userId = idFromUrl(req, "user");
  if (userId && (req.method === "PUT" || req.method === "DELETE")) {
    req._previousUser = await User.findById(userId)
      .select("fullName email status roleId")
      .populate("roleId", "roleName")
      .lean();
  }

  const roleId = req.headers?.roleid;
  if (
    roleId &&
    mongoose.Types.ObjectId.isValid(roleId) &&
    (req.method === "PATCH" || req.method === "PUT")
  ) {
    req._previousRole = await Role.findById(roleId)
      .select("roleName permission denied status admin")
      .lean();
  }

  const ownerId = idFromUrl(req, "lorry");
  if (ownerId && (req.method === "PUT" || req.method === "DELETE")) {
    const owner = await LorryOwner.findById(ownerId)
      .select("ownerName phoneNum address companyName")
      .lean();
    const lorries = await Lorry.find({ owner: ownerId })
      .select("lorryNum capacity")
      .lean();
    req._previousOwner = owner ? { ...owner, lorries } : null;
  }
}

function entityIdFromRequest(req) {
  return (
    idFromUrl(req, "assignlorry") ||
    idFromUrl(req, "destination") ||
    idFromUrl(req, "user") ||
    idFromUrl(req, "lorry") ||
    (req.headers?.roleid && mongoose.Types.ObjectId.isValid(req.headers.roleid)
      ? req.headers.roleid
      : null)
  );
}

async function userChangeSummary(req, described) {
  const body = req.body || {};
  const previous = req._previousUser || {};
  const name = userLabel(previous, body);

  if (req.method === "POST") {
    const roleName = await roleNameById(body.roleId);
    const parts = [`Created user ${name}`];
    if (body.email) parts.push(`Email ${body.email}`);
    if (roleName) parts.push(`Role ${roleName}`);
    return { action: "Created user", summary: parts.join(". ") };
  }

  if (req.method === "PUT") {
    const changes = [];
    if (body.fullName && body.fullName !== previous.fullName) {
      changes.push(
        `Changed name from ${previous.fullName || "—"} to ${body.fullName}`
      );
    }
    if (body.email && body.email !== previous.email) {
      changes.push(
        `Changed email from ${previous.email || "—"} to ${body.email}`
      );
    }
    if (body.roleId && String(body.roleId) !== String(previous.roleId?._id || previous.roleId || "")) {
      const fromRole = previous.roleId?.roleName || "—";
      const toRole = (await roleNameById(body.roleId)) || "—";
      changes.push(`Changed role from ${fromRole} to ${toRole}`);
    }
    if (body.status !== undefined) {
      const nextActive = isTruthyStatus(body.status);
      const prevActive = isTruthyStatus(previous.status);
      if (nextActive !== prevActive) {
        changes.push(nextActive ? "Activated account" : "Deactivated account");
      }
    }
    return {
      action: `Updated user · ${name}`,
      summary: changes.length
        ? `${name}: ${changes.join(". ")}`
        : `Updated user ${name}`,
    };
  }

  if (req.method === "DELETE") {
    const activating = isTruthyStatus(req.headers?.status);
    return {
      action: activating ? "Activated user" : "Deactivated user",
      summary: `${activating ? "Activated" : "Deactivated"} user ${name}${
        previous.email ? ` (${previous.email})` : ""
      }`,
    };
  }

  return { action: described.action, summary: described.action };
}

function roleChangeSummary(req, described) {
  const body = req.body || {};
  const previous = req._previousRole || {};
  const name = body.roleName || previous.roleName || "role";

  if (req.method === "POST") {
    const count = Array.isArray(body.permission) ? body.permission.length : 0;
    const parts = [`Created role ${name}`];
    if (body.admin) parts.push("Admin role");
    if (count) parts.push(`${count} permission${count === 1 ? "" : "s"}`);
    return { action: "Created role", summary: parts.join(". ") };
  }

  if (String(req.originalUrl || "").includes("/activateRole")) {
    return {
      action: "Activated role",
      summary: `Activated role ${previous.roleName || name}`,
    };
  }
  if (String(req.originalUrl || "").includes("/deactivateRole")) {
    return {
      action: "Deactivated role",
      summary: `Deactivated role ${previous.roleName || name}`,
    };
  }

  const changes = [];
  if (body.roleName && body.roleName !== previous.roleName) {
    changes.push(
      `Changed name from ${previous.roleName || "—"} to ${body.roleName}`
    );
  }
  if (body.admin !== undefined && Boolean(body.admin) !== Boolean(previous.admin)) {
    changes.push(body.admin ? "Made admin" : "Removed admin access");
  }
  if (Array.isArray(body.permission)) {
    const diff = permissionDiff(previous.permission, body.permission);
    if (diff.length) changes.push(`Permissions ${diff.join("; ")}`);
  }
  if (Array.isArray(body.denied)) {
    const before = new Set((previous.denied || []).map(Number));
    const after = new Set(body.denied.map(Number));
    const added = [...after].filter((id) => !before.has(id)).map(permissionLabel);
    const removed = [...before].filter((id) => !after.has(id)).map(permissionLabel);
    if (added.length) changes.push(`Denied ${added.join(", ")}`);
    if (removed.length) changes.push(`Allowed ${removed.join(", ")}`);
  }

  return {
    action: `Updated role · ${name}`,
    summary: changes.length ? `${name}: ${changes.join(". ")}` : `Updated role ${name}`,
  };
}

function lorryChangeSummary(req, described) {
  const body = req.body || {};
  const previous = req._previousOwner || {};
  const name = ownerLabel(previous, body);
  const url = String(req.originalUrl || "");

  if (url.includes("/lorries") && !url.endsWith("/lorry") && req.method !== "PUT") {
    if (req.method === "POST") {
      return {
        action: "Added lorry",
        summary: `Added lorry ${body.lorryNum || ""} to ${name}`.trim(),
      };
    }
    if (req.method === "DELETE") {
      return {
        action: "Removed lorry",
        summary: `Removed a lorry from ${name}`,
      };
    }
  }

  if (req.method === "POST") {
    const lorries = Array.isArray(body.lorries) ? body.lorries : [];
    const numbers = lorries.map((item) => item.lorryNum).filter(Boolean);
    const parts = [`Created lorry owner ${name}`];
    if (body.phoneNum) parts.push(`Phone ${body.phoneNum}`);
    if (lorries.length) {
      parts.push(
        `${lorries.length} lorry${lorries.length === 1 ? "" : "s"}${
          numbers.length ? `: ${numbers.join(", ")}` : ""
        }`
      );
    }
    return { action: "Created lorry owner", summary: parts.join(". ") };
  }

  if (req.method === "PUT") {
    const changes = [];
    [
      ["ownerName", "owner name"],
      ["companyName", "company"],
      ["phoneNum", "phone"],
      ["address", "address"],
    ].forEach(([key, label]) => {
      if (body[key] !== undefined && String(body[key]) !== String(previous[key] || "")) {
        changes.push(
          `Changed ${label} from ${previous[key] || "—"} to ${body[key] || "—"}`
        );
      }
    });

    if (Array.isArray(body.lorries)) {
      const before = previous.lorries || [];
      const beforeIds = new Set(before.map((item) => String(item._id)));
      const afterIds = new Set(
        body.lorries
          .map((item) => item._id)
          .filter(Boolean)
          .map(String)
      );
      const added = body.lorries.filter((item) => !item._id);
      const removed = before.filter((item) => !afterIds.has(String(item._id)));
      const updated = body.lorries.filter((item) => {
        if (!item._id || !beforeIds.has(String(item._id))) return false;
        const prev = before.find((row) => String(row._id) === String(item._id));
        return (
          prev &&
          (String(prev.lorryNum) !== String(item.lorryNum) ||
            String(prev.capacity) !== String(item.capacity))
        );
      });
      if (added.length) {
        changes.push(
          `Added lorry${added.length === 1 ? "" : "s"} ${added
            .map((item) => item.lorryNum)
            .filter(Boolean)
            .join(", ")}`
        );
      }
      if (removed.length) {
        changes.push(
          `Removed lorry${removed.length === 1 ? "" : "s"} ${removed
            .map((item) => item.lorryNum)
            .filter(Boolean)
            .join(", ")}`
        );
      }
      updated.forEach((item) => {
        const prev = before.find((row) => String(row._id) === String(item._id));
        if (prev?.lorryNum !== item.lorryNum) {
          changes.push(
            `Changed lorry number from ${prev.lorryNum} to ${item.lorryNum}`
          );
        }
        if (String(prev?.capacity) !== String(item.capacity)) {
          changes.push(
            `Changed ${item.lorryNum || "lorry"} capacity from ${prev?.capacity || "—"} to ${item.capacity || "—"}`
          );
        }
      });
    }

    return {
      action: `Updated lorry owner · ${name}`,
      summary: changes.length ? `${name}: ${changes.join(". ")}` : `Updated lorry owner ${name}`,
    };
  }

  if (req.method === "DELETE") {
    return {
      action: "Deleted lorry owner",
      summary: `Deleted lorry owner ${name}`,
    };
  }

  return { action: described.action, summary: described.action };
}

function heldUpChangeSummary(req, described) {
  const body = req.body || {};
  const amount =
    body.amount !== undefined ? formatMoney(body.amount) : "";
  const date = body.date ? formatDate(body.date) : "";
  return {
    action: "Created held up rate",
    summary: `Set held up rate to ${amount || "a new amount"}${
      date && date !== "—" ? ` from ${date}` : ""
    }. Previous active rate was deactivated`,
  };
}

function authChangeSummary(req, described, success) {
  const email = req.body?.email || "";
  if (String(req.originalUrl || "").includes("/user-login")) {
    if (success) {
      return {
        action: "Logged in",
        summary: email ? `Signed in as ${email}` : "Signed in",
      };
    }
    return {
      action: "Login failed",
      summary: email
        ? `Failed sign-in for ${email}`
        : "Failed sign-in",
    };
  }
  if (String(req.originalUrl || "").includes("/logout")) {
    return { action: "Logged out", summary: "Signed out" };
  }
  return { action: described.action, summary: described.action };
}

module.exports = {
  loadPreviousEntities,
  entityIdFromRequest,
  userChangeSummary,
  roleChangeSummary,
  lorryChangeSummary,
  heldUpChangeSummary,
  authChangeSummary,
};
