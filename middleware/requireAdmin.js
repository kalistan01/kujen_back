const { User } = require("../models");

function isAdminRole(role) {
  if (!role) return false;
  return (
    Boolean(role.admin) ||
    String(role.roleName || "").toLowerCase() === "admin"
  );
}

exports.isAdminRole = isAdminRole;

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
      "roleName admin permission denied"
    );
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
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
