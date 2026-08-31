const { User } = require("../models");
const { isAdminRole, accessDeniedMessage } = require("./requireAdmin");

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

const FIELD_EDIT_BY_ID = {
  40: "weight",
  41: "dayHire",
  42: "advanced",
  43: "advancedDate",
  44: "balancePaid",
  45: "balanceDate",
  46: "outHire",
  47: "other",
  48: "heldUp",
  49: "agentFee",
  50: "transportCommission",
  51: "return",
};

const FIELD_ADD_BY_ID = {
  52: "weight",
  53: "dayHire",
  54: "advanced",
  55: "advancedDate",
  56: "balancePaid",
  57: "balanceDate",
  58: "outHire",
  59: "other",
  60: "heldUp",
  61: "agentFee",
  62: "transportCommission",
  63: "return",
};

const MUST_GRANT = new Set([
  1, 2, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
]);

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
  const legacyEdit = { 12: 2, 13: 4, 14: 7, 15: 9, 16: 5 };
  const addId = legacyEdit[id];
  if (addId && permission.includes(addId) && !denied.includes(id)) return true;
  const legacyFromParent = {
    17: [8, 5, 16],
    18: [5, 16],
    19: [16],
  };
  const parents = legacyFromParent[id];
  if (parents && parents.some((parentId) => permission.includes(parentId))) {
    return true;
  }
  const legacyFieldAdd = {
    52: 40,
    53: 41,
    54: 42,
    55: 43,
    56: 44,
    57: 45,
    58: 46,
    59: 47,
    60: 48,
    61: 49,
    62: 50,
    63: 51,
  };
  const editId = legacyFieldAdd[id];
  if (editId && permission.includes(editId) && !denied.includes(id)) return true;
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

function canAddField(role, key) {
  if (
    key === "totals" ||
    key === "total" ||
    key === "paid" ||
    key === "remaining"
  ) {
    return false;
  }
  if (!canSeeField(role, key)) return false;
  const entry = Object.entries(FIELD_ADD_BY_ID).find(([, field]) => field === key);
  if (!entry) return true;
  return can(role, Number(entry[0]));
}

function canEditField(role, key) {
  if (
    key === "totals" ||
    key === "total" ||
    key === "paid" ||
    key === "remaining"
  ) {
    return false;
  }
  if (!canSeeField(role, key)) return false;
  const entry = Object.entries(FIELD_EDIT_BY_ID).find(([, field]) => field === key);
  if (!entry) return true;
  return can(role, Number(entry[0]));
}

function deniedFieldKeys(role) {
  if (!role || isAdminRole(role)) return [];
  return Object.entries(FIELD_BY_ID)
    .filter(([, key]) => !canSeeField(role, key))
    .map(([, key]) => key);
}

function uneditableFieldKeys(role) {
  if (!role || isAdminRole(role)) return [];
  return Object.entries(FIELD_BY_ID)
    .filter(([, key]) => !canEditField(role, key))
    .map(([, key]) => key);
}

function unaddableFieldKeys(role) {
  if (!role || isAdminRole(role)) return [];
  return Object.entries(FIELD_BY_ID)
    .filter(([, key]) => !canAddField(role, key))
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
  const count = Array.isArray(obj.containers) ? obj.containers.length : 0;
  obj.containerCount = count;
  if (!can(role, 17)) {
    obj.containers = [];
    return obj;
  }
  if (Array.isArray(obj.containers)) {
    obj.containers = obj.containers.map((container) =>
      redactContainer(container, role)
    );
  }
  return obj;
}

function stripDeniedFromBody(body, role, mode = "edit") {
  if (!body || typeof body !== "object" || isAdminRole(role)) return body;
  const keys = mode === "add" ? unaddableFieldKeys(role) : uneditableFieldKeys(role);
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
      "roleName admin permission denied status"
    );
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const blocked = accessDeniedMessage(user);
    if (blocked) {
      return res.status(403).json({ success: false, message: blocked });
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
  canAddField,
  canEditField,
  deniedFieldKeys,
  uneditableFieldKeys,
  redactAssignment,
  stripDeniedFromBody,
  loadAuthRole,
  requireCan,
  requireAny,
  FIELD_BY_ID,
  FIELD_ADD_BY_ID,
  FIELD_EDIT_BY_ID,
};
