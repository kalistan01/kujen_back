const { User } = require("../models");

function isAdminRole(role) {
  if (!role) return false;
  return (
    Boolean(role.admin) ||
    String(role.roleName || "").toLowerCase() === "admin"
  );
}

function isActiveFlag(value) {
  if (value === false || value === 0 || value === "0" || value === "false") {
    return false;
  }
  if (value === true || value === 1 || value === "1" || value === "true") {
    return true;
  }
  return value == null;
}

function accessDeniedMessage(user) {
  if (!user) return "Unauthorized";
  if (!isActiveFlag(user.status)) {
    return "Your account is inactive. Contact an administrator to restore access.";
  }
  const role =
    user.roleId && typeof user.roleId === "object" ? user.roleId : null;
  if (!role) {
    return "Your account has no role assigned. Contact an administrator.";
  }
  if (!isActiveFlag(role.status)) {
    return "Your role is inactive. You cannot sign in until the role is activated.";
  }
  return null;
}

exports.isAdminRole = isAdminRole;
exports.isActiveFlag = isActiveFlag;
exports.accessDeniedMessage = accessDeniedMessage;

exports.publicUser = (user) => {
  const role =
    user?.roleId && typeof user.roleId === "object" ? user.roleId : null;
  const admin = isAdminRole(role);
  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    roleId: role?._id || user.roleId,
    roleName: role?.roleName || "",
    admin,
    permission: admin ? [] : role?.permission || [],
    denied: admin ? [] : role?.denied || [],
  };
};

exports.requireAdmin = async (req, res, next) => {
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
    if (!isAdminRole(user.roleId)) {
      return res
        .status(403)
        .json({ success: false, message: "Admin access only" });
    }
    req.authUser = user;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to verify admin access.",
      error: error.message,
    });
  }
};
