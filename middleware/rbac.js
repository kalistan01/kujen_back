const { User } = require("../models");
const { isAdminRole } = require("./requireAdmin");

const FIELD_BY_ID = {
  20: "weight",
  21: "dayHire",
  22: "advanced",
  23: "advancedDate",
  24: "balancePaid",
  25: "balanceDate",
  26: "outHire",
  27: "other",
  28: "heldUp",
  29: "agentFee",
  30: "transportCommission",
  31: "return",
};

const MUST_GRANT = new Set([1, 2, 4, 5, 7, 9, 10]);

function toIdList(value) {
  return (Array.isArray(value) ? value : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

function can(role, id) {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  const denied = toIdList(role.denied);
  const permission = toIdList(role.permission);
  if (denied.includes(id)) return false;
  if (permission.includes(id)) return true;
  return !MUST_GRANT.has(id);
}

function canSeeField(role, key) {
  if (key === "totals" || key === "total" || key === "paid" || key === "remaining") {
    return can(role, 32);
  }
  const entry = Object.entries(FIELD_BY_ID).find(([, field]) => field === key);
  if (!entry) return true;
  return can(role, Number(entry[0]));
}

function deniedFieldKeys(role) {
  if (!role || isAdminRole(role)) return [];
  const denied = new Set(toIdList(role.denied));
  return Object.entries(FIELD_BY_ID)
    .filter(([id]) => denied.has(Number(id)))
    .map(([, key]) => key);
}

function redactContainer(container, role) {
  if (!container || typeof container !== "object") return container;
  const keys = deniedFieldKeys(role);
  if (!keys.length) return container;
  const copy = { ...container };
  keys.forEach((key) => {
    delete copy[key];
  });
  return copy;
}

function redactAssignment(assignment, role) {
  if (!assignment || isAdminRole(role)) return assignment;
  const obj = assignment.toObject ? assignment.toObject() : { ...assignment };
  if (Array.isArray(obj.containers)) {
    obj.containers = obj.containers.map((container) =>
      redactContainer(container, role)
    );
  }
  return obj;
}

function stripDeniedFromBody(body, role) {
  if (!body || typeof body !== "object" || isAdminRole(role)) return body;
  const keys = deniedFieldKeys(role);
  if (!keys.length) return body;
  const copy = { ...body };
  keys.forEach((key) => {
    delete copy[key];
  });
  if (Array.isArray(copy.containers)) {
    copy.containers = copy.containers.map((container) => {
      const next = { ...container };
      keys.forEach((key) => {
        delete next[key];
      });
      return next;
    });
  }
  return copy;
}

async function loadAuthRole(req, res, next) {
  try {
    const userid = req.tokenData?.userid;
    if (!userid) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findById(userid).populate(
      "roleId",
      "roleName admin permission denied"
    );
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    req.authUser = user;
    req.authRole = user.roleId;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to verify role access.",
      error: error.message,
    });
  }
}

function requireCan(id) {
  return (req, res, next) => {
    if (can(req.authRole, id)) return next();
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
    });
  };
}

function requireAny(ids) {
  return (req, res, next) => {
    if ((ids || []).some((id) => can(req.authRole, id))) return next();
    return res.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
    });
  };
}

module.exports = {
  can,
  canSeeField,
  deniedFieldKeys,
  redactAssignment,
  stripDeniedFromBody,
  loadAuthRole,
  requireCan,
  requireAny,
  FIELD_BY_ID,
};
