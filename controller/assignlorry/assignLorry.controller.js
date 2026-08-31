const { LorryOwner, AssignLorry, User } = require("../../models");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const {
  redactAssignment,
  stripDeniedFromBody,
  canEditField,
} = require("../../middleware/rbac");
const { emitAssignmentChange } = require("../../lib/socket");
const { applyFclToContainer, emptyFcl } = require("../../lib/fcl");
const { isAdminRole, isActiveFlag } = require("../../middleware/requireAdmin");

function formatSaveError(error) {
  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {})
      .map((item) => item.message)
      .filter(Boolean);
    if (messages.length) return [...new Set(messages)].join(" ");
  }

  if (error?.name === "CastError") {
    if (String(error.path || "").includes("lorryId")) {
      return "Please select a valid lorry.";
    }
    if (String(error.path || "").includes("destination")) {
      return "Please select a valid destination.";
    }
    return "One of the selected values is invalid.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function applyAdvancedDate(container = {}) {
  const next = { ...container };
  if ((Number(next.advanced) || 0) > 0) {
    if (!next.advancedDate) next.advancedDate = new Date();
  } else {
    delete next.advancedDate;
  }
  return next;
}

function vocSequenceFrom(value) {
  const match = String(value || "").trim().match(/^RGB-(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function formatVocNo(n) {
  return `RGB-${n}`;
}

async function getMaxVocNumber() {
  const rows = await AssignLorry.aggregate([
    { $unwind: { path: "$containers", preserveNullAndEmptyArrays: false } },
    { $project: { vocNo: "$containers.vocNo" } },
  ]);
  return rows.reduce(
    (max, row) => Math.max(max, vocSequenceFrom(row.vocNo)),
    0
  );
}

async function nextVocNumbers(count) {
  const size = Math.max(1, Number(count) || 1);
  const max = await getMaxVocNumber();
  return Array.from({ length: size }, (_, index) =>
    formatVocNo(max + index + 1)
  );
}

async function loadAssignmentForSync(id) {
  const assignment = await AssignLorry.findById(id)
    .populate({ path: "createdBy", select: "fullName" })
    .populate({ path: "updatedBy", select: "fullName" })
    .populate({
      path: "containers",
      populate: [
        { path: "createdBy", select: "fullName" },
        { path: "updatedBy", select: "fullName" },
        { path: "destination" },
        {
          path: "lorryId",
          select: "lorryNum capacity owner",
          populate: {
            path: "owner",
            select: "ownerName companyName phoneNum",
          },
        },
      ],
    });
  if (!assignment) return null;

  const obj = assignment.toObject();
  obj.containers = (obj.containers || [])
    .filter((container) => container && (container.containerNo || container._id))
    .map((container) => ({
      ...container,
      lorryNum: container.lorryNum || container.lorryId?.lorryNum,
      capacity: container.capacity || container.lorryId?.capacity,
      lorryOwner:
        container.lorryOwner ||
        container.lorryId?.owner?.ownerName ||
        container.lorryId?.owner?.companyName,
      destinationlocation:
        container.destinationlocation || container.destination?.location,
      destinationtype:
        container.destinationtype || container.destination?.type,
      lorryownerphn:
        container.lorryownerphn || container.lorryId?.owner?.phoneNum,
      lorryownerCompany:
        container.lorryownerCompany || container.lorryId?.owner?.companyName,
    }));

  const statusCount = obj.containers.reduce(
    (acc, container) => {
      const status = container.status;
      if (!acc[status]) acc[status] = 0;
      acc[status] += 1;
      return acc;
    },
    { "in-progress": 0, completed: 0, pending: 0, advanced: 0 }
  );
  const allCompleted =
    obj.containers.length > 0 &&
    obj.containers.every((container) => container.status === "completed");

  return {
    ...obj,
    status: allCompleted ? "completed" : "pending",
    ...statusCount,
  };
}

function syncAssignment(req, action, id) {
  if (!id) return;
  if (action === "deleted") {
    emitAssignmentChange(req, { action, id: String(id) }, null);
    return;
  }
  loadAssignmentForSync(id)
    .then((assignment) => {
      if (!assignment) return;
      emitAssignmentChange(
        req,
        { action, id: String(assignment._id) },
        assignment
      );
    })
    .catch((error) => {
      console.error("Socket assignment emit failed:", error.message);
    });
}

exports.getNextVocNo = async (req, res) => {
  try {
    const nextNumber = (await getMaxVocNumber()) + 1;
    res.status(200).json({
      success: true,
      nextNumber,
      next: formatVocNo(nextNumber),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not get the next VOC number. Please try again.",
    });
  }
};

exports.createAssignLorry = async (req, res) => {
  try {
    const { userid } = req.tokenData;
    const assignmentData = {
      ...stripDeniedFromBody(req.body, req.authRole),
      createdBy: userid,
      updatedBy: userid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (assignmentData.containers && Array.isArray(assignmentData.containers)) {
      const vocNos = await nextVocNumbers(assignmentData.containers.length);
      const nextContainers = [];
      for (let index = 0; index < assignmentData.containers.length; index += 1) {
        const dated = applyAdvancedDate(assignmentData.containers[index]);
        delete dated.heldUpExtraDays;
        delete dated.heldUpRate;
        dated.heldUp = Number(dated.heldUp) || 0;
        const applied = applyFclToContainer(dated);
        if (applied.error) {
          return res.status(400).json({
            success: false,
            message: applied.error,
          });
        }
        if (!dated.demoundDate) delete dated.demoundDate;
        nextContainers.push({
          ...dated,
          fcl: applied.fcl,
          vocNo: vocNos[index],
          destination: dated.destination || undefined,
          createdBy: userid,
          updatedBy: userid,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      assignmentData.containers = nextContainers;
    }

    const result = await AssignLorry.create(assignmentData);
    syncAssignment(req, "created", result._id);
    return res.status(201).send({
      status: 0,
      success: true,
      data: result,
    });
  } catch (error) {
    if (
      error.name === "ValidationError" ||
      error.name === "CastError" ||
      error.code === 11000
    ) {
      return res.status(400).json({
        success: false,
        message: formatSaveError(error),
      });
    }
    res.status(500).json({
      success: false,
      message: "Could not create the assignment. Please try again.",
    });
  }
};
exports.getAllAssignLorries = async (req, res) => {
  try {
    const assignments = await AssignLorry.find({})
      .populate({ path: "createdBy", select: "fullName" })
      .populate({ path: "updatedBy", select: "fullName" })
      .populate({
        path: "containers",
        populate: [
          { path: "createdBy", select: "fullName" },
          { path: "updatedBy", select: "fullName" },
          { path: "destination" },
          {
            path: "lorryId",
            select: "lorryNum capacity owner",
            populate: {
              path: "owner",
              select: "ownerName companyName",
            },
          },
        ],
      });
    const assignmentsWithStatus = assignments.map((assignment) => {
      const allCompleted = assignment.containers.every(
        (c) => c.status === "completed"
      );
      const overallStatus = allCompleted ? "completed" : "pending";
      const obj = assignment.toObject();
      obj.containers = (obj.containers || []).map((container) => ({
        ...container,
        lorryNum: container.lorryNum || container.lorryId?.lorryNum,
        capacity: container.capacity || container.lorryId?.capacity,
        lorryOwner:
          container.lorryOwner ||
          container.lorryId?.owner?.ownerName ||
          container.lorryId?.owner?.companyName,
        destinationlocation:
          container.destinationlocation || container.destination?.location,
      }));
      return {
        ...obj,
        status: overallStatus,
      };
    });

    res.status(200).json({
      success: true,
      count: assignmentsWithStatus.length,
      data: assignmentsWithStatus.map((item) =>
        redactAssignment(item, req.authRole)
      ),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load assignments. Please try again.",
    });
  }
};
exports.getAssignLorryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Assignment ID format.",
      });
    }
    const assignment = await AssignLorry.findById(id)
      .populate({
        path: "createdBy",
        select: "fullName",
      })
      .populate({ path: "updatedBy", select: "fullName" })
      .populate({
        path: "containers",
        populate: [
          { path: "createdBy", select: "fullName" },
          { path: "updatedBy", select: "fullName" },
          { path: "destination" },
          {
            path: "lorryId",
            select: "lorryNum capacity owner",
            populate: {
              path: "owner",
              select: "ownerName",
            },
          },
        ],
      });
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }
    const allCompleted = assignment.containers.every(
      (c) => c.status === "completed"
    );
    const overallStatus = allCompleted ? "completed" : "pending";
    const assignmentWithStatus = {
      ...assignment.toObject(),
      status: overallStatus,
    };
    res.status(200).json({
      success: true,
      data: assignmentWithStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this assignment. Please try again.",
    });
  }
};
exports.getAssignLorryByIds = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Assignment ID format.",
      });
    }
    const assignment = await AssignLorry.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(id) },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy",
        },
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "updatedBy",
          foreignField: "_id",
          as: "updatedBy",
        },
      },
      { $unwind: { path: "$updatedBy", preserveNullAndEmptyArrays: true } },
      {
        $unwind: { path: "$containers", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "lorries",
          localField: "containers.lorryId",
          foreignField: "_id",
          as: "containers.lorry",
        },
      },

      {
        $unwind: {
          path: "$containers.lorry",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "lorries",
          let: { lorry_id: "$containers.lorryId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$lorry_id"] },
              },
            },
            {
              $project: {
                _id: 0,
                lorryNum: 1,
                capacity: 1,
                owner: 1,
              },
            },
          ],
          as: "lorryInfo",
        },
      },
      {
        $unwind: { path: "$lorryInfo", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          "containers.lorryNum": "$lorryInfo.lorryNum",
          "containers.capacity": "$lorryInfo.capacity",
          "containers.owner": "$lorryInfo.owner",
        },
      },
      {
        $unset: "containers.lorry",
      },

      {
        $unwind: {
          path: "$containers.createdBy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          let: { created_id: "$containers.createdBy" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$created_id"] },
              },
            },
            {
              $project: {
                _id: 0,
                fullName: 1,
              },
            },
          ],
          as: "createdInfo",
        },
      },
      {
        $unwind: { path: "$createdInfo", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          "containers.createdBy": "$createdInfo.fullName",
        },
      },

      {
        $unwind: {
          path: "$containers.updatedBy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          let: { updated_id: "$containers.updatedBy" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$updated_id"] },
              },
            },
            {
              $project: {
                _id: 0,
                fullName: 1,
              },
            },
          ],
          as: "updatedInfo",
        },
      },
      {
        $unwind: { path: "$updatedInfo", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          "containers.updatedBy": "$updatedInfo.fullName",
        },
      },

      {
        $unwind: {
          path: "$containers.destination",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "destinations",
          let: { dest_id: "$containers.destination" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$dest_id"] },
              },
            },
            {
              $project: {
                _id: 0,
                location: 1,
                type: 1,
              },
            },
          ],
          as: "destinationInfo",
        },
      },
      {
        $unwind: { path: "$destinationInfo", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          "containers.destinationlocation": "$destinationInfo.location",
          "containers.destinationtype": "$destinationInfo.type",
        },
      },
      {
        $unwind: {
          path: "$containers.owner",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "lorryowners",
          let: { owner_id: "$containers.owner" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$owner_id"] },
              },
            },
            {
              $project: {
                _id: 0,
                ownerName: 1,
                phoneNum: 1,
                companyName: 1,
              },
            },
          ],
          as: "ownerInfo",
        },
      },
      {
        $unwind: { path: "$ownerInfo", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          "containers.lorryOwner": "$ownerInfo.ownerName",
          "containers.lorryownerphn": "$ownerInfo.phoneNum",
          "containers.lorryownerCompany": "$ownerInfo.companyName",
        },
      },
      {
        $group: {
          _id: "$_id",
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          createdBy: { $first: "$createdBy" },
          updatedBy: { $first: "$updatedBy" },
          blNo: { $first: "$blNo" },
          cusdecDate: { $first: "$cusdecDate" },
          cusdecNo: { $first: "$cusdecNo" },
          regNo: { $first: "$regNo" },
          item: { $first: "$item" },
          exporter: { $first: "$exporter" },
          importer: { $first: "$importer" },
          containers: { $push: "$containers" },
        },
      },

      {
        $project: {
          _id: 1,
          containers: 1,
          createdAt: 1,
          updatedAt: 1,
          blNo: 1,
          cusdecDate: 1,
          cusdecNo: 1,
          regNo: 1,
          item: 1,
          exporter: 1,
          importer: 1,
          createdBy: "$createdBy.fullName",
          updatedBy: "$updatedBy.fullName",
        },
      },
    ]);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }
    const newassignment = assignment[0];
    if (!newassignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }
    newassignment.containers = (newassignment.containers || []).filter(
      (c) => c && (c.containerNo || c._id)
    );

    const statusCount = newassignment.containers.reduce(
      (acc, container) => {
        const status = container.status;

        if (!acc[status]) {
          acc[status] = 0;
        }
        acc[status]++;
        return acc;
      },
      { "in-progress": 0, completed: 0, pending: 0, advanced: 0 }
    );

    // Determine overall status
    const allCompleted =
      newassignment.containers.length > 0 &&
      newassignment.containers.every((c) => c.status === "completed");
    const overallStatus = allCompleted ? "completed" : "pending";

    // Combine with assignment
    const assignmentWithStatus = {
      ...newassignment,
      status: overallStatus,
      ...statusCount, // add the counts here
    };

    res.status(200).json({
      success: true,
      data: redactAssignment(assignmentWithStatus, req.authRole),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this assignment. Please try again.",
    });
  }
};
exports.deleteAssignLorry = async (req, res) => {
  try {
    const { id } = req.params;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Admin email and password are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Assignment ID format.",
      });
    }

    const invalidAdmin = () =>
      res.status(403).json({
        success: false,
        message: "Invalid admin credentials.",
      });

    const adminUser = await User.findOne({ email })
      .select("+password")
      .populate("roleId", "roleName admin permission denied status");

    if (!adminUser) return invalidAdmin();

    const passwordMatch = await bcrypt.compare(password, adminUser.password);
    if (!passwordMatch) return invalidAdmin();
    if (!isActiveFlag(adminUser.status)) return invalidAdmin();

    const role =
      adminUser.roleId && typeof adminUser.roleId === "object"
        ? adminUser.roleId
        : null;
    if (!role || !isActiveFlag(role.status) || !isAdminRole(role)) {
      return invalidAdmin();
    }

    const deletedAssignment = await AssignLorry.findByIdAndDelete(id);

    if (!deletedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    syncAssignment(req, "deleted", id);
    res.status(200).json({
      success: true,
      message: "Assignment deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not delete the assignment. Please try again.",
    });
  }
};
exports.updateBasicinfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { userid } = req.tokenData;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Assignment ID format.",
      });
    }

    const deletedAssignment = await AssignLorry.findByIdAndUpdate(
      { _id: id },
      { ...req.body, updatedBy: userid, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!deletedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Assignment updated successfully.",
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: formatSaveError(error),
      });
    }
    res.status(500).json({
      success: false,
      message: "Could not update the assignment. Please try again.",
    });
  }
};
exports.addContainer = async (req, res) => {
  try {
    const { id } = req.params;
    const newContainer = stripDeniedFromBody(req.body, req.authRole);
    const { userid } = req.tokenData;
    newContainer.createdBy = userid;
    newContainer.updatedBy = userid;
    newContainer.createdAt = new Date();
    newContainer.updatedAt = new Date();
    if (newContainer.balancePaid && !newContainer.balanceDate) {
      newContainer.balanceDate = new Date();
    }
    if (!newContainer.destination) {
      delete newContainer.destination;
    }
    if (!newContainer.demoundDate) {
      delete newContainer.demoundDate;
    }
    const [vocNo] = await nextVocNumbers(1);
    newContainer.vocNo = vocNo;
    const dated = applyAdvancedDate(newContainer);
    delete dated.heldUpExtraDays;
    delete dated.heldUpRate;
    dated.heldUp = Number(dated.heldUp) || 0;
    Object.assign(newContainer, dated);
    if (!dated.advancedDate) delete newContainer.advancedDate;
    newContainer.fcl = emptyFcl();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Assignment ID format." });
    }

    const updatedAssignment = await AssignLorry.findByIdAndUpdate(
      id,
      { $push: { containers: newContainer } },
      { new: true, runValidators: true }
    );

    if (!updatedAssignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found." });
    }

    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Container added successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: formatSaveError(error),
      });
    }
    res.status(500).json({
      success: false,
      message: "Could not add the container. Please try again.",
    });
  }
};
exports.removeContainer = async (req, res) => {
  try {
    const { id, containerId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(containerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }

    const updatedAssignment = await AssignLorry.findByIdAndUpdate(
      id,
      { $pull: { container: { _id: containerId } } },
      { new: true }
    );

    if (!updatedAssignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found." });
    }

    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Container removed successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not remove the container. Please try again.",
    });
  }
};
exports.updateContainerDetails = async (req, res) => {
  try {
    const { id, containerId } = req.params;
    const body = stripDeniedFromBody(req.body || {}, req.authRole);
    const allowed = [
      "containerNo",
      "lorryId",
      "loadingDate",
      "demoundDate",
      "destination",
      "weight",
      "dayHire",
      "advanced",
      "advancedDate",
      "balancePaid",
      "balanceDate",
      "outHire",
      "other",
      "heldUp",
      "agentFee",
      "transportCommission",
      "status",
      "return",
      "note",
    ];
    const { userid } = req.tokenData;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(containerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }

    const $set = {
      "containers.$.updatedBy": userid,
      "containers.$.updatedAt": new Date(),
    };
    const $unset = {};
    allowed.forEach((key) => {
      if (body[key] !== undefined) {
        if (key === "destination" && !body[key]) return;
        if (key === "advancedDate") return;
        if (key === "demoundDate" && !body[key]) {
          $unset["containers.$.demoundDate"] = 1;
          return;
        }
        $set[`containers.$.${key}`] = body[key];
      }
    });
    if (body.balancePaid && body.balanceDate === undefined) {
      $set["containers.$.balanceDate"] = new Date();
    }

    const existingAssignment = await AssignLorry.findOne({
      _id: id,
      "containers._id": containerId,
    });
    const existing = existingAssignment?.containers?.id(containerId);
    if (existing) {
      const dated = applyAdvancedDate({
        advanced: body.advanced ?? existing.advanced,
        advancedDate:
          body.advancedDate !== undefined
            ? body.advancedDate
            : existing.advancedDate,
      });
      if (dated.advancedDate) {
        $set["containers.$.advancedDate"] = dated.advancedDate;
      } else {
        $unset["containers.$.advancedDate"] = 1;
      }
    }

    const updatedAssignment = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      Object.keys($unset).length ? { $set, $unset } : { $set },
      {
        new: true,
      }
    );

    if (!updatedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or container does not exist.",
      });
    }

    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Container details updated successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: formatSaveError(error),
      });
    }
    res.status(500).json({
      success: false,
      message: "Could not update the container. Please try again.",
    });
  }
};
exports.payContainerBalance = async (req, res) => {
  try {
    if (!canEditField(req.authRole, "balancePaid")) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to pay container balances.",
      });
    }
    const { id, containerId } = req.params;
    const { userid } = req.tokenData;
    const balanceDate = req.body.balanceDate || new Date();

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(containerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }

    const assignment = await AssignLorry.findById(id);
    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found." });
    }

    const container = assignment.containers.id(containerId);
    if (!container) {
      return res
        .status(404)
        .json({ success: false, message: "Container does not exist." });
    }

    const charged = container.toObject ? container.toObject() : container;
    const chargeKeys = [
      "weight",
      "dayHire",
      "outHire",
      "other",
      "heldUp",
      "return",
    ];
    const total = chargeKeys.reduce(
      (sum, key) => sum + Number(charged[key] || 0),
      0
    );
    const remaining =
      total -
      Number(container.advanced || 0) -
      Number(container.balancePaid || 0);

    if (remaining <= 0) {
      return res.status(400).json({
        success: false,
        message: "This container has no remaining balance.",
      });
    }

    const updatedAssignment = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      {
        $set: {
          "containers.$.balancePaid":
            Number(container.balancePaid || 0) + remaining,
          "containers.$.balanceDate": balanceDate,
          "containers.$.updatedBy": userid,
          "containers.$.updatedAt": new Date(),
        },
      },
      { new: true }
    );

    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Balance paid successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not pay the container balance. Please try again.",
    });
  }
};
const hireChargeKeys = [
  "weight",
  "dayHire",
  "outHire",
  "other",
  "heldUp",
  "return",
];
const remainingHire = (container) => {
  const total = hireChargeKeys.reduce(
    (sum, key) => sum + Number(container[key] || 0),
    0
  );
  return (
    total -
    Number(container.advanced || 0) -
    Number(container.balancePaid || 0)
  );
};
exports.payContainersBalance = async (req, res) => {
  try {
    if (!canEditField(req.authRole, "balancePaid")) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to pay container balances.",
      });
    }
    const { id } = req.params;
    const { userid } = req.tokenData;
    const containerIds = Array.isArray(req.body.containerIds)
      ? req.body.containerIds
      : [];
    const balanceDate = req.body.balanceDate || new Date();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }
    if (!containerIds.length) {
      return res.status(400).json({
        success: false,
        message: "Select at least one container.",
      });
    }

    const assignment = await AssignLorry.findById(id);
    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found." });
    }

    let paidCount = 0;
    containerIds.forEach((containerId) => {
      if (!mongoose.Types.ObjectId.isValid(containerId)) return;
      const container = assignment.containers.id(containerId);
      if (!container) return;
      const remaining = remainingHire(container);
      if (remaining <= 0) return;
      container.balancePaid = Number(container.balancePaid || 0) + remaining;
      container.balanceDate = balanceDate;
      container.updatedBy = userid;
      container.updatedAt = new Date();
      paidCount += 1;
    });

    if (!paidCount) {
      return res.status(400).json({
        success: false,
        message: "None of the selected containers have a remaining balance.",
      });
    }

    assignment.updatedBy = userid;
    await assignment.save();

    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Balances paid successfully.",
      data: assignment,
      paidCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not pay the selected balances. Please try again.",
    });
  }
};
exports.updatedContainerStatus = async (req, res) => {
  try {
    const { id, containerId } = req.params;
    const { status, fcl } = req.body;
    const { userid } = req.tokenData;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(containerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }

    if (status === undefined && fcl === undefined) {
      return res.status(400).json({
        success: false,
        message: "No status or FCL update provided.",
      });
    }

    const $set = {
      "containers.$.updatedBy": userid,
      "containers.$.updatedAt": new Date(),
    };
    if (status !== undefined) {
      $set["containers.$.status"] = status;
    }
    if (fcl !== undefined) {
      const applied = applyFclToContainer({ fcl });
      if (applied.error) {
        return res.status(400).json({
          success: false,
          message: applied.error,
        });
      }
      $set["containers.$.fcl"] = applied.fcl;
    }

    const updatedAssignment = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      { $set },
      { new: true }
    );
    if (!updatedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or container does not exist.",
      });
    }
    syncAssignment(req, "updated", id);
    res.status(200).json({
      success: true,
      message: "Container details updated successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update the container status. Please try again.",
    });
  }
};
