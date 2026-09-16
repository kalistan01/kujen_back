const { Role, LorryOwner } = require("../../../models");
const { emitChange } = require("../../../lib/socket");
const { isActiveFlag } = require("../../../middleware/requireAdmin");
const mongoose = require("mongoose");

function formatSaveError(error) {
  if (error?.code === 11000) {
    const value = error.keyValue?.roleName;
    return value
      ? `Role name "${value}" already exists.`
      : "A role with this name already exists.";
  }

  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {})
      .map((item) => item.message)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRoleByName(roleName, excludeId) {
  const query = {
    roleName: { $regex: `^${escapeRegex(roleName.trim())}$`, $options: "i" },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Role.findOne(query);
}

function roleIdFromReq(req) {
  return String(req.body?.roleid || req.body?.roleId || req.headers.roleid || "").trim();
}

function parseAllowedLorryOwners(value) {
  const ids = (Array.isArray(value) ? value : [])
    .map((id) => String(id?._id || id || "").trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  return [...new Set(ids)];
}

async function validAllowedLorryOwners(value, admin, restrict) {
  if (admin || !restrict) return [];
  const ids = parseAllowedLorryOwners(value);
  if (!ids.length) {
    const error = new Error("Select at least one lorry owner for a restricted role.");
    error.status = 400;
    throw error;
  }
  const count = await LorryOwner.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) {
    const error = new Error("One or more selected lorry owners were not found.");
    error.status = 400;
    throw error;
  }
  return ids;
}

function rolePayload(role) {
  if (!role) return null;
  return typeof role.toObject === "function" ? role.toObject() : role;
}

function syncRole(req, action, role) {
  const data = rolePayload(role);
  emitChange(req, {
    module: "role",
    action,
    id: data?._id,
    data,
  });
}

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

exports.addRole = async (req, res) => {
  try {
    const { roleName, permission, denied, status, admin, allowedLorryOwners, restrictLorryOwners } = req.body;
    const name = String(roleName || "").trim();

    if (!name) {
      return sendError(res, 400, "Role name is required.");
    }

    const existing = await findRoleByName(name);
    if (existing) {
      return sendError(res, 400, `Role name "${name}" already exists.`);
    }

    const restrict = Boolean(admin ? false : restrictLorryOwners);
    const result = await Role.create({
      roleName: name,
      permission,
      denied,
      restrictLorryOwners: restrict,
      allowedLorryOwners: await validAllowedLorryOwners(
        allowedLorryOwners,
        admin,
        restrict
      ),
      status: isActiveFlag(status),
      admin,
    });

    syncRole(req, "created", result);
    return res.status(201).send({
      status: 0,
      success: true,
      data: rolePayload(result),
    });
  } catch (error) {
    if (error.status === 400) {
      return sendError(res, 400, error.message);
    }
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    return sendError(res, 500, "Could not create the role. Please try again.");
  }
};

exports.findRole = async (req, res) => {
  try {
    const result = await Role.find()
      .select("roleName permission denied restrictLorryOwners allowedLorryOwners status admin createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).send({
      success: true,
      data: result,
    });
  } catch (error) {
    return sendError(res, 500, "Could not load roles. Please try again.");
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { roleName, permission, denied, admin, status, allowedLorryOwners, restrictLorryOwners } = req.body;
    const roleid = roleIdFromReq(req);
    const name = String(roleName || "").trim();

    if (!roleid) {
      return sendError(res, 400, "Role ID is required.");
    }
    if (!name) {
      return sendError(res, 400, "Role name is required.");
    }

    const existing = await findRoleByName(name, roleid);
    if (existing) {
      return sendError(res, 400, `Role name "${name}" already exists.`);
    }

    const restrict = Boolean(admin ? false : restrictLorryOwners);
    const update = {
      roleName: name,
      permission,
      denied,
      restrictLorryOwners: restrict,
      allowedLorryOwners: await validAllowedLorryOwners(
        allowedLorryOwners,
        admin,
        restrict
      ),
      admin,
    };
    if (status !== undefined) {
      update.status = isActiveFlag(status);
    }

    const result = await Role.findByIdAndUpdate(roleid, update, {
      new: true,
      runValidators: true,
    });

    if (!result) {
      return sendError(res, 404, "Role not found.");
    }

    syncRole(req, "updated", result);
    return res.status(200).send({
      success: true,
      data: rolePayload(result),
    });
  } catch (error) {
    if (error.status === 400) {
      return sendError(res, 400, error.message);
    }
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    return sendError(res, 500, "Could not update the role. Please try again.");
  }
};

exports.findRoleId = async (req, res) => {
  try {
    const roleid = roleIdFromReq(req);
    if (!roleid) {
      return sendError(res, 400, "Role ID is required.");
    }

    const result = await Role.findById(roleid);
    if (!result) {
      return sendError(res, 404, "Role not found.");
    }

    return res.status(200).send({
      success: true,
      data: rolePayload(result),
    });
  } catch (error) {
    return sendError(res, 500, "Could not load this role. Please try again.");
  }
};

exports.deactivateRole = async (req, res) => {
  try {
    const roleid = roleIdFromReq(req);
    if (!roleid) {
      return sendError(res, 400, "Role ID is required.");
    }

    const result = await Role.findByIdAndUpdate(
      roleid,
      { status: false },
      { new: true }
    );

    if (!result) {
      return sendError(res, 404, "Role not found.");
    }

    syncRole(req, "updated", result);
    return res.status(200).send({
      success: true,
      data: rolePayload(result),
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not deactivate the role. Please try again."
    );
  }
};

exports.activateRole = async (req, res) => {
  try {
    const roleid = roleIdFromReq(req);
    if (!roleid) {
      return sendError(res, 400, "Role ID is required.");
    }

    const result = await Role.findByIdAndUpdate(
      roleid,
      { status: true },
      { new: true }
    );

    if (!result) {
      return sendError(res, 404, "Role not found.");
    }

    syncRole(req, "updated", result);
    return res.status(200).send({
      success: true,
      data: rolePayload(result),
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not activate the role. Please try again."
    );
  }
};
