const { createToken } = require("../../../middleware/token");
const { User, Role } = require("../../../models");
const { publicUser, accessDeniedMessage, isActiveFlag } = require("../../../middleware/requireAdmin");
const { authCookie } = require("../../../config/cookie");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { emitChange, onlineUserIds } = require("../../../lib/socket");
const { upsertLoginDevice } = require("../../../lib/device");

exports.adminsignUp = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      return res.status(403).json({
        message: "Admin registration is disabled after the first admin.",
        success: false,
      });
    }
    const user = await User.findOne({ email: email });
    if (user) {
      return res.status(200).json({
        message: "employee already exists",
        success: false,
      });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const permission = Array.from({ length: 999 }, (_, i) => i + 1);
    const role = await Role.create({
      roleName: "admin",
      permission: permission,
      denied: [],
      admin: true,
    });
    const createAdmin = await User.create({
      fullName,
      email,
      password: hashedPassword,
      roleId: role._id,
    });
    if (createAdmin) {
      return res.status(201).json({
        message: "admin created successfully",
        success: true,
      });
    } else {
      return res.status(500).json({
        message: "Something went wrong",
        success: false,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};

exports.adminlogIn = async (req, res) => {
  try {
    const { password, email } = req.body;

    const admin = await User.findOne({ email }).select("+password").populate(
      "roleId",
      "roleName admin permission denied status allowedLorryOwners restrictLorryOwners"
    );
    if (!admin) {
      return res.status(404).json({
        message: "No account found for this email.",
        success: false,
      });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({
        message: "Incorrect email or password.",
        success: false,
      });
    }

    const blocked = accessDeniedMessage(admin);
    if (blocked) {
      return res.status(403).json({
        message: blocked,
        success: false,
      });
    }

    const jsonToken = createToken(admin._id, admin.roleId);

    // Set token in HTTP-only cookie
    res.cookie("token", jsonToken, authCookie);
    await upsertLoginDevice(admin._id, req);

    admin.password = undefined;
    const synced = await userForSync(admin._id, req.app.get("io"));
    emitChange(req, {
      module: "user",
      action: "updated",
      id: admin._id,
      actorId: "",
      data: synced,
    });

    return res.status(200).json({
      message: "Login successful",
      success: true,
      user: publicUser(admin),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Something went wrong",
      success: false,
      error: error.message,
    });
  }
};

exports.adminReset = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters.",
        success: false,
      });
    }
    const admin = await User.findOne({ email });
    if (!admin) {
      return res.status(404).json({
        message: "Admin not found",
        success: false,
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password
    const updatedAdmin = await User.findOneAndUpdate(
      { email },
      { password: hashedPassword },
      { new: true }
    );

    if (updatedAdmin) {
      return res.status(200).json({
        message: "Password reset successfully",
        success: true,
      });
    } else {
      return res.status(500).json({
        message: "Failed to update admin password",
        success: false,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

function formatSaveError(error) {
  if (error?.code === 11000) {
    const value = error.keyValue?.email;
    return value
      ? `A user with email "${value}" already exists.`
      : "A user with this email already exists.";
  }

  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {})
      .map((item) => item.message)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function userForSync(userId, io) {
  const user = await User.findById(userId)
    .select("-password")
    .populate("roleId", "roleName status");
  if (!user) return null;
  const obj = user.toObject();
  return {
    ...obj,
    id: String(obj._id),
    roleName: obj.roleId?.roleName || "",
    roleStatus: obj.roleId?.status !== false,
    roleId: obj.roleId?._id || obj.roleId,
    online: onlineUserIds(io).has(String(obj._id)),
  };
}

function syncUser(req, action, id, data) {
  emitChange(req, {
    module: "user",
    action,
    id,
    data: data ?? null,
  });
}

exports.createUser = async (req, res) => {
  const { fullName, email, password, roleId, status } = req.body;
  try {
    const name = String(fullName || "").trim();
    const mail = String(email || "").trim().toLowerCase();

    if (!name) {
      return sendError(res, 400, "Full name is required.");
    }
    if (!mail) {
      return sendError(res, 400, "Email is required.");
    }
    if (!/\S+@\S+\.\S+/.test(mail)) {
      return sendError(res, 400, "Enter a valid email address.");
    }
    if (!password) {
      return sendError(res, 400, "Password is required.");
    }
    if (String(password).length < 6) {
      return sendError(res, 400, "Password must be at least 6 characters.");
    }
    if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
      return sendError(res, 400, "Please select a valid role.");
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return sendError(res, 400, "Selected role was not found.");
    }

    const userExists = await User.findOne({ email: mail });
    if (userExists) {
      return sendError(res, 400, `A user with email "${mail}" already exists.`);
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = await User.create({
      fullName: name,
      email: mail,
      password: hashedPassword,
      roleId,
      status: isActiveFlag(status),
    });

    const userResponse = await userForSync(user._id, req.app.get("io"));
    syncUser(req, "created", user._id, userResponse);
    res.status(201).json({ success: true, data: userResponse });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not create the user. Please try again.",
    });
  }
};

/**
 * @description Get all users
 * @route GET /api/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const onlineIds = onlineUserIds(req.app.get("io"));
    const users = await User.aggregate([
      {
        $lookup: {
          from: "roles",
          localField: "roleId",
          foreignField: "_id",
          as: "role",
        },
      },
      {
        $unwind: {
          path: "$role",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $addFields: {
          roleName: "$role.roleName",
          roleId: "$role._id",
          roleStatus: { $ne: ["$role.status", false] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          fullName: 1,
          email: 1,
          status: 1,
          roleId: 1,
          roleName: 1,
          roleStatus: 1,
          createdAt: 1,
          updatedAt: 1,
          lastSeen: 1,
          lastLoginAt: 1,
          lastLoginIp: 1,
          lastLoginDevice: 1,
        },
      },
    ]);

    const data = users.map((user) => ({
      ...user,
      online: onlineIds.has(String(user._id)),
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load users. Please try again.",
    });
  }
};

/**
 * @description Get a single user by ID
 * @route GET /api/users/:userId
 */
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, "Invalid user ID.");
    }
    const user = await userForSync(userId, req.app.get("io"));
    if (!user) {
      return sendError(res, 404, "User not found.");
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this user. Please try again.",
    });
  }
};

/**
 * @description Admin sets another user's password
 * @route PATCH /user/:userId/password
 */
exports.changeUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    const password = req.body?.password;
    const confirmPassword = req.body?.confirmPassword;
    if (!password || String(password).length < 6) {
      return sendError(res, 400, "Password must be at least 6 characters.");
    }
    if (
      confirmPassword != null &&
      String(confirmPassword) !== String(password)
    ) {
      return sendError(res, 400, "Passwords do not match.");
    }

    const actorId = String(req.tokenData?.userid || "");
    if (actorId && actorId === String(userId)) {
      return sendError(
        res,
        400,
        "Choose another account. This action is for other users."
      );
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const user = await User.findByIdAndUpdate(
      userId,
      { password: hashedPassword },
      { new: true }
    ).select("-password");

    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update the password. Please try again.",
    });
  }
};

/**
 * @description Update a user
 * @route PUT /api/users/:userId
 */
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, "Invalid user ID.");
    }

    const { fullName, status, roleId } = req.body;
    const name = String(fullName || "").trim();

    if (!name) {
      return sendError(res, 400, "Full name is required.");
    }
    if (!roleId || !mongoose.Types.ObjectId.isValid(roleId)) {
      return sendError(res, 400, "Please select a valid role.");
    }

    const role = await Role.findById(roleId);
    if (!role) {
      return sendError(res, 400, "Selected role was not found.");
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { fullName: name, status, roleId },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return sendError(res, 404, "User not found.");
    }
    const synced = await userForSync(user._id, req.app.get("io"));
    syncUser(req, "updated", user._id, synced);
    res.status(200).json({ success: true, data: synced || user });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not update the user. Please try again.",
    });
  }
};

/**
 * @description Delete a user
 * @route DELETE /api/users/:userId
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.headers;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, "Invalid user ID.");
    }
    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    );
    if (!user) {
      return sendError(res, 404, "User not found.");
    }
    const synced = await userForSync(user._id, req.app.get("io"));
    syncUser(req, "updated", user._id, synced);
    res.status(200).json({
      success: true,
      message: "User status updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update the user status. Please try again.",
    });
  }
};
