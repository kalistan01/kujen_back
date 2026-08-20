const { LorryOwner, AssignLorry } = require("../../models");
const mongoose = require("mongoose");
exports.createAssignLorry = async (req, res) => {
  try {
    const { userid } = req.tokenData;
    const assignmentData = {
      ...req.body,
      createdBy: userid,
      updatedBy: userid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (assignmentData.containers && Array.isArray(assignmentData.containers)) {
      assignmentData.containers = assignmentData.containers.map((c) => ({
        ...c,
        createdBy: userid,
        updatedBy: userid,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }
    AssignLorry.create(assignmentData)
      .then((result) => {
        return res.status(201).send({
          status: 0,
          success: true,
          data: result,
        });
      })
      .catch((e) => {
        return res.status(500).json({
          message: "Something went wrong",
          success: false,
          error: e.message,
        });
      });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Failed to create assignment.",
      error: error.message,
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
          { path: "lorryId" },
        ],
      });
    const assignmentsWithStatus = assignments.map((assignment) => {
      const allCompleted = assignment.containers.every(
        (c) => c.status === "completed"
      );
      const overallStatus = allCompleted ? "completed" : "pending";
      return {
        ...assignment.toObject(),
        status: overallStatus,
      };
    });

    res.status(200).json({
      success: true,
      count: assignmentsWithStatus.length,
      data: assignmentsWithStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch assignments.",
      error: error.message,
    });
  }
};
exports.getAssignLorryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format.",
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
      message: "Failed to fetch assignment.",
      error: error.message,
    });
  }
};
exports.getAssignLorryByIds = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format.",
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
      { "in-progress": 0, completed: 0, pending: 0 }
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
      data: assignmentWithStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch assignment.",
      error: error.message,
    });
  }
};
exports.deleteAssignLorry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format.",
      });
    }

    const deletedAssignment = await AssignLorry.findByIdAndDelete(id);

    if (!deletedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Assignment deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete assignment.",
      error: error.message,
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
        message: "Invalid ID format.",
      });
    }

    const deletedAssignment = await AssignLorry.findByIdAndUpdate(
      { _id: id },
      { ...req.body, updatedBy: userid, updatedAt: new Date() },
      { new: true }
    );

    if (!deletedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Assignment updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete assignment.",
      error: error.message,
    });
  }
};
exports.addContainer = async (req, res) => {
  try {
    const { id } = req.params;
    const newContainer = req.body;
    const { userid } = req.tokenData;
    newContainer.createdBy = userid;
    newContainer.updatedBy = userid;
    newContainer.createdAt = new Date();
    newContainer.updatedAt = new Date();
    if (!newContainer.advancedDate) {
      newContainer.advancedDate = new Date();
    }
    if (newContainer.balancePaid && !newContainer.balanceDate) {
      newContainer.balanceDate = new Date();
    }

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

    res.status(200).json({
      success: true,
      message: "Container added successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to add container.",
      error: error.message,
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

    res.status(200).json({
      success: true,
      message: "Container removed successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to remove container.",
      error: error.message,
    });
  }
};
exports.updateContainerDetails = async (req, res) => {
  try {
    const { id, containerId } = req.params;
    const {
      containerNo,
      vocNo,
      lorryId,
      loadingDate,
      demoundDate,
      destination,
      weight,
      dayHire,
      advanced,
      outHire,
      other,
      heldUp,
      agentFee,
      transportCommission,
      status,
    } = req.body;
    const returns = req.body.return;
    const advancedDate = req.body.advancedDate || new Date();
    const balancePaid = req.body.balancePaid || 0;
    const balanceDate =
      req.body.balanceDate || (balancePaid ? new Date() : undefined);
    const { userid } = req.tokenData;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(containerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }

    const updatedAssignment = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      {
        $set: {
          "containers.$.containerNo": containerNo,
          "containers.$.vocNo": vocNo,
          "containers.$.lorryId": lorryId,
          "containers.$.loadingDate": loadingDate,
          "containers.$.demoundDate": demoundDate,
          "containers.$.destination": destination,
          "containers.$.weight": weight,
          "containers.$.dayHire": dayHire,
          "containers.$.outHire": outHire,
          "containers.$.other": other,
          "containers.$.advanced": advanced,
          "containers.$.advancedDate": advancedDate,
          "containers.$.balancePaid": balancePaid,
          "containers.$.balanceDate": balanceDate,
          "containers.$.heldUp": heldUp,
          "containers.$.agentFee": agentFee,
          "containers.$.transportCommission": transportCommission,
          "containers.$.status": status,
          "containers.$.return": returns,
          "containers.$.updatedBy": userid,
          "containers.$.updatedAt": new Date(),
        },
      },
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

    res.status(200).json({
      success: true,
      message: "Container details updated successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update container details.",
      error: error.message,
    });
  }
};
exports.payContainerBalance = async (req, res) => {
  try {
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

    const chargeKeys = [
      "weight",
      "dayHire",
      "outHire",
      "other",
      "heldUp",
      "return",
    ];
    const total = chargeKeys.reduce(
      (sum, key) => sum + Number(container[key] || 0),
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

    res.status(200).json({
      success: true,
      message: "Balance paid successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to pay container balance.",
      error: error.message,
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

    res.status(200).json({
      success: true,
      message: "Balances paid successfully.",
      data: assignment,
      paidCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to pay container balances.",
      error: error.message,
    });
  }
};
exports.updatedContainerStatus = async (req, res) => {
  try {
    const { id, containerId } = req.params;
    const { status } = req.body;
    const { userid } = req.tokenData;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(containerId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format provided." });
    }

    if (status === undefined) {
      return res.status(400).json({
        success: false,
        message: "No status or returnValue provided for update.",
      });
    }

    const updatedAssignment = await AssignLorry.findOneAndUpdate(
      { _id: id, "containers._id": containerId },
      {
        $set: {
          "containers.$.status": status,
          "containers.$.updatedBy": userid,
          "containers.$.updatedAt": new Date(),
        },
      },
      { new: true }
    );
    if (!updatedAssignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or container does not exist.",
      });
    }
    res.status(200).json({
      success: true,
      message: "Container details updated successfully.",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update container details.",
      error: error.message,
    });
  }
};
