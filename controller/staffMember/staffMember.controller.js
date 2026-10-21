const { StaffMember, User } = require("../../models");
const mongoose = require("mongoose");
const { emitChange } = require("../../lib/socket");

function formatSaveError(error) {
  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {})
      .map((item) => item.message)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  if (error?.code === 11000 && error?.keyPattern?.userId) {
    return "That user account is already linked to another staff member.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function readStaffMember(body) {
  const userIdRaw = body?.userId;
  let userId = null;
  if (
    userIdRaw !== undefined &&
    userIdRaw !== null &&
    String(userIdRaw).trim() !== ""
  ) {
    userId = String(userIdRaw).trim();
  }

  let status = true;
  if (body?.status !== undefined) {
    if (
      body.status === false ||
      body.status === 0 ||
      body.status === "0" ||
      body.status === "false"
    ) {
      status = false;
    } else {
      status = true;
    }
  }

  return {
    name: String(body?.name || "").trim(),
    phone: String(body?.phone || "").trim(),
    notes: String(body?.notes || "").trim(),
    userId,
    status,
  };
}

function validateStaffMember(input) {
  if (!input.name) return "Name is required.";
  if (input.name.length > 120) {
    return "Name cannot be longer than 120 characters.";
  }
  if (input.phone.length > 40) {
    return "Phone cannot be longer than 40 characters.";
  }
  if (input.notes.length > 500) {
    return "Notes cannot be longer than 500 characters.";
  }
  if (input.userId && !mongoose.Types.ObjectId.isValid(input.userId)) {
    return "Invalid user ID.";
  }
  return "";
}

async function assertUserLink(userId, excludeId) {
  if (!userId) return "";
  const user = await User.findById(userId).select("_id");
  if (!user) return "Linked user account not found.";
  const query = { userId };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await StaffMember.findOne(query).select("_id name");
  if (existing) {
    return `That user account is already linked to "${existing.name}".`;
  }
  return "";
}

function populateUser(query) {
  return query.populate("userId", "fullName email status");
}

exports.createStaffMember = async (req, res) => {
  try {
    const input = readStaffMember(req.body);
    const message = validateStaffMember(input);
    if (message) return sendError(res, 400, message);

    const linkError = await assertUserLink(input.userId);
    if (linkError) return sendError(res, 400, linkError);

    const staffMember = await StaffMember.create(input);
    const populated = await populateUser(StaffMember.findById(staffMember._id));

    emitChange(req, {
      module: "staff-member",
      action: "created",
      id: staffMember._id,
      data: populated,
    });
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not create the staff member. Please try again.",
    });
  }
};

exports.getAllStaffMembers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status === "true" || req.query.status === "1") {
      filter.status = true;
    } else if (req.query.status === "false" || req.query.status === "0") {
      filter.status = false;
    }

    const staffMembers = await populateUser(
      StaffMember.find(filter).sort({ name: 1, createdAt: -1 })
    );
    res.status(200).json({
      success: true,
      count: staffMembers.length,
      data: staffMembers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load staff members. Please try again.",
    });
  }
};

exports.getStaffMemberById = async (req, res) => {
  try {
    const { staffMemberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(staffMemberId)) {
      return sendError(res, 400, "Invalid staff member ID.");
    }
    const staffMember = await populateUser(StaffMember.findById(staffMemberId));
    if (!staffMember) return sendError(res, 404, "Staff member not found.");
    res.status(200).json({ success: true, data: staffMember });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this staff member. Please try again.",
    });
  }
};

exports.updateStaffMember = async (req, res) => {
  try {
    const { staffMemberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(staffMemberId)) {
      return sendError(res, 400, "Invalid staff member ID.");
    }

    const input = readStaffMember(req.body);
    const message = validateStaffMember(input);
    if (message) return sendError(res, 400, message);

    const linkError = await assertUserLink(input.userId, staffMemberId);
    if (linkError) return sendError(res, 400, linkError);

    const staffMember = await StaffMember.findByIdAndUpdate(
      staffMemberId,
      input,
      { new: true, runValidators: true }
    );
    if (!staffMember) return sendError(res, 404, "Staff member not found.");

    const populated = await populateUser(StaffMember.findById(staffMember._id));

    emitChange(req, {
      module: "staff-member",
      action: "updated",
      id: staffMember._id,
      data: populated,
    });
    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not update the staff member. Please try again.",
    });
  }
};
