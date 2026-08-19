const { createToken } = require("../../../middleware/token");
const { User, Role } = require("../../../models");
const { publicUser } = require("../../../middleware/requireAdmin");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

exports.adminsignUp = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
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
      "roleName admin"
    );
    if (!admin) {
      return res.status(404).json({
        message: "Invalid admin",
        success: false,
        error: "Admin not found",
      });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
        success: false,
      });
    }

    const jsonToken = createToken(admin._id, admin.roleId);

    // Set token in HTTP-only cookie
    res.cookie("token", jsonToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only secure in production
      sameSite: "Strict", // prevents CSRF
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    admin.password = undefined;

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

exports.createUser = async (req, res) => {
  const { fullName, email, password, roleId } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
      roleId,
    });

    // Don't send the password back
    const userResponse = await User.findById(user._id).select("-password");

    res.status(201).json({ success: true, data: userResponse });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/**
 * @description Get all users
 * @route GET /api/users
 */
exports.getAllUsers = async (req, res) => {
  try {
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
        },
      },

      {
        $project: {
          password: 0,
          role: 0,
          __v: 0,
        },
      },
    ]);

    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid User ID" });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid User ID" });
    }

    // Prevent password from being updated through this route
    const { fullName, status, roleId } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { fullName, status, roleId },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid User ID" });
    }
    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true }
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
