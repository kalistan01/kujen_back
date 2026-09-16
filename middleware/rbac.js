const mongoose = require("mongoose");
const { User, Lorry } = require("../models");
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
  1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
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

function canViewFullFleet(role) {
  return can(role, 3) || can(role, 4) || can(role, 13);
}

function idString(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
}

function allowedOwnerIdSet(role) {
  if (!role || isAdminRole(role)) return null;
  const ids = (Array.isArray(role.allowedLorryOwners) ? role.allowedLorryOwners : [])
    .map(idString)
    .filter(Boolean);
  const restricted =
    Boolean(role.restrictLorryOwners) ||
    (role.restrictLorryOwners == null && ids.length > 0);
  if (!restricted) return null;
  return new Set(ids);
}

function isOwnerInScope(role, ownerId) {
  const allowed = allowedOwnerIdSet(role);
  if (!allowed) return true;
  return allowed.has(idString(ownerId));
}

function ownerIdFromContainer(container) {
  if (!container || typeof container !== "object") return "";
  const lorry = container.lorryId;
  if (lorry && typeof lorry === "object") {
    const owner = lorry.owner;
    if (owner && typeof owner === "object") return idString(owner);
    if (owner) return String(owner);
  }
  return "";
}

function filterContainersByOwnerScope(containers, role) {
  const allowed = allowedOwnerIdSet(role);
  if (!allowed) return containers;
  return (Array.isArray(containers) ? containers : []).filter((container) =>
    allowed.has(ownerIdFromContainer(container))
  );
}

async function rejectDisallowedLorries(role, lorryIds) {
  const allowed = allowedOwnerIdSet(role);
  if (!allowed) return null;
  const ids = [...new Set((lorryIds || []).map(idString))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (!ids.length) return null;
  const lorries = await Lorry.find({ _id: { $in: ids } }).select("owner");
  const blocked = lorries.some((lorry) => !allowed.has(idString(lorry.owner)));
  if (blocked) {
    return "You can only use lorries assigned to your role.";
  }
  return null;
}

function slimOwner(owner) {
  if (!owner || typeof owner !== "object") return owner;
  const obj = owner.toObject ? owner.toObject() : { ...owner };
  return {
    _id: obj._id,
    ownerName: obj.ownerName,
    companyName: obj.companyName,
    lorries: (obj.lorries || []).map((lorry) => ({
      _id: lorry._id,
      lorryNum: lorry.lorryNum,
      capacity: lorry.capacity,
      owner:
        lorry.owner && typeof lorry.owner === "object"
          ? lorry.owner._id
          : lorry.owner,
      inUse: lorry.inUse,
    })),
  };
}

function slimLorry(lorry) {
  if (!lorry || typeof lorry !== "object") return lorry;
  const obj = lorry.toObject ? lorry.toObject() : { ...lorry };
  const owner = obj.owner;
  return {
    _id: obj._id,
    lorryNum: obj.lorryNum,
    capacity: obj.capacity,
    owner:
      owner && typeof owner === "object"
        ? {
            _id: owner._id,
            ownerName: owner.ownerName,
            companyName: owner.companyName,
          }
        : owner,
    inUse: obj.inUse,
  };
}

function redactLorryOwner(owner, role) {
  if (!owner) return owner;
  const obj = owner.toObject ? owner.toObject() : owner;
  if (!isOwnerInScope(role, obj._id || obj.id)) return null;
  if (canViewFullFleet(role)) return obj;
  return slimOwner(obj);
}

function redactLorry(lorry, role) {
  if (!lorry) return lorry;
  const obj = lorry.toObject ? lorry.toObject() : lorry;
  const ownerId =
    obj.owner && typeof obj.owner === "object" ? obj.owner._id : obj.owner;
  if (!isOwnerInScope(role, ownerId)) return null;
  if (canViewFullFleet(role)) return obj;
  return slimLorry(obj);
}

function stripOwnerContactsFromAssignment(assignment) {
  if (!assignment || typeof assignment !== "object") return assignment;
  const obj = { ...assignment };
  if (!Array.isArray(obj.containers)) return obj;
  obj.containers = obj.containers.map((container) => {
    if (!container || typeof container !== "object") return container;
    const next = { ...container };
    delete next.lorryownerphn;
    const lorry = next.lorryId;
    if (lorry && typeof lorry === "object" && lorry.owner && typeof lorry.owner === "object") {
      next.lorryId = {
        ...lorry,
        owner: {
          _id: lorry.owner._id,
          ownerName: lorry.owner.ownerName,
          companyName: lorry.owner.companyName,
        },
      };
    }
    return next;
  });
  return obj;
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
  if (!assignment) return assignment;
  let obj = assignment.toObject ? assignment.toObject() : { ...assignment };
  if (isAdminRole(role)) return obj;
  if (Array.isArray(obj.containers)) {
    obj.containers = filterContainersByOwnerScope(obj.containers, role);
  }
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
  if (!canViewFullFleet(role)) {
    obj = stripOwnerContactsFromAssignment(obj);
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
      "roleName admin permission denied status allowedLorryOwners restrictLorryOwners"
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
  canViewFullFleet,
  allowedOwnerIdSet,
  isOwnerInScope,
  filterContainersByOwnerScope,
  rejectDisallowedLorries,
  redactLorryOwner,
  redactLorry,
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
