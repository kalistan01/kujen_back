const { LorryOwner, Lorry, AssignLorry } = require("../../models");
const mongoose = require("mongoose");
const { emitChange } = require("../../lib/socket");
const { can } = require("../../middleware/rbac");

function canViewFullFleet(role) {
  return can(role, 3) || can(role, 4);
}

function slimOwnerForAssignment(owner) {
  return {
    _id: owner._id,
    ownerName: owner.ownerName,
    companyName: owner.companyName,
    lorries: (owner.lorries || []).map((lorry) => ({
      _id: lorry._id,
      lorryNum: lorry.lorryNum,
      capacity: lorry.capacity,
      owner: lorry.owner,
      inUse: lorry.inUse,
    })),
  };
}

async function findLorriesUsedInAssignments(lorryIds) {
  const ids = (lorryIds || []).filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (!ids.length) return [];

  const usedIds = await AssignLorry.distinct("containers.lorryId", {
    "containers.lorryId": { $in: ids },
  });
  const usedSet = new Set(usedIds.map((id) => id.toString()));
  return ids.filter((id) => usedSet.has(id.toString()));
}

function formatSaveError(error) {
  if (error?.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0];
    const value = error.keyValue?.[field];
    if (field === "lorryNum") {
      return `Lorry number "${value}" is already registered.`;
    }
    return value
      ? `"${value}" is already in use.`
      : "This value is already registered.";
  }

  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {})
      .map((item) => item.message)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

async function ownerForSync(ownerId) {
  const owner = await LorryOwner.findById(ownerId).lean();
  if (!owner) return null;
  const lorries = await markLorriesInUse(
    await Lorry.find({ owner: ownerId }).lean()
  );
  return { ...owner, lorries };
}

function syncLorryOwner(req, action, id, data) {
  emitChange(req, {
    module: "lorry",
    action,
    id,
    data: data ?? null,
  });
}

async function markLorriesInUse(lorries) {
  const usedIds = new Set(
    (
      await findLorriesUsedInAssignments((lorries || []).map((lorry) => lorry._id))
    ).map((id) => id.toString())
  );
  return (lorries || []).map((lorry) => ({
    ...lorry,
    inUse: usedIds.has(String(lorry._id)),
  }));
}

exports.createLorryOwner = async (req, res) => {
  try {
    const { ownerName, phoneNum, address, companyName, lorries, createdBy } =
      req.body;
    const actorId = req.tokenData?.userid || createdBy;
    const lorryRows = Array.isArray(lorries) ? lorries : [];
    const lorryNums = lorryRows
      .map((lorry) => String(lorry?.lorryNum || "").trim())
      .filter(Boolean);
    const uniqueNums = new Set(lorryNums.map((num) => num.toLowerCase()));
    if (uniqueNums.size !== lorryNums.length) {
      return res.status(400).json({
        success: false,
        message: "Each lorry number must be unique.",
      });
    }
    if (lorryNums.length) {
      const existing = await Lorry.find({
        lorryNum: { $in: lorryNums },
      }).select("lorryNum");
      if (existing.length) {
        return res.status(400).json({
          success: false,
          message: `Lorry number "${existing[0].lorryNum}" is already registered.`,
        });
      }
    }

    const owner = new LorryOwner({
      ownerName,
      phoneNum,
      address,
      companyName,
      createdBy: actorId,
      updatedBy: actorId,
    });

    await owner.save();

    const lorryDocs = lorryRows.map((lorry) => ({
      lorryNum: lorry.lorryNum,
      capacity: lorry.capacity,
      owner: owner._id,
    }));

    let createdLorries = [];
    try {
      createdLorries = lorryDocs.length ? await Lorry.insertMany(lorryDocs) : [];
    } catch (error) {
      await LorryOwner.findByIdAndDelete(owner._id);
      throw error;
    }

    const data = {
      ...owner.toObject(),
      lorries: createdLorries.map((lorry) =>
        typeof lorry.toObject === "function" ? lorry.toObject() : lorry
      ),
    };
    syncLorryOwner(req, "created", owner._id, data);
    res.status(201).json({
      success: true,
      data,
      owner: data,
      lorries: data.lorries,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: formatSaveError(error) });
    }
    res.status(500).json({
      success: false,
      message: "Could not create the lorry owner. Please try again.",
    });
  }
};

exports.getAllLorryOwners = async (req, res) => {
  try {
    const owners = await LorryOwner.find().lean();
    const lorries = await markLorriesInUse(await Lorry.find().lean());
    const ownersWithLorries = owners.map((owner) => {
      return {
        ...owner,
        lorries: lorries.filter(
          (lorry) => lorry.owner.toString() === owner._id.toString()
        ),
      };
    });
    const payload = canViewFullFleet(req.authRole)
      ? ownersWithLorries
      : ownersWithLorries.map(slimOwnerForAssignment);
    res.status(200).json({ success: true, data: payload });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
exports.getAllLorries = async (req, res) => {
  try {
    const allLorries = await Lorry.find().populate({
      path: "owner",
      select: canViewFullFleet(req.authRole)
        ? "ownerName companyName phoneNum address"
        : "ownerName companyName",
    });
    const data = canViewFullFleet(req.authRole)
      ? allLorries
      : allLorries.map((lorry) => ({
          _id: lorry._id,
          lorryNum: lorry.lorryNum,
          capacity: lorry.capacity,
          owner: lorry.owner
            ? {
                _id: lorry.owner._id,
                ownerName: lorry.owner.ownerName,
                companyName: lorry.owner.companyName,
              }
            : lorry.owner,
        }));
    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.getLorryOwnerById = async (req, res) => {
  try {
    const { ownerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner ID" });
    }
    const lorryOwner = await LorryOwner.findById(ownerId);
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }
    const data = canViewFullFleet(req.authRole)
      ? lorryOwner
      : {
          _id: lorryOwner._id,
          ownerName: lorryOwner.ownerName,
          companyName: lorryOwner.companyName,
        };
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.updateLorryOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const { ownerName, phoneNum, address, companyName, lorries } = req.body;

    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner ID" });
    }

    const lorryOwner = await LorryOwner.findByIdAndUpdate(
      ownerId,
      { ownerName, phoneNum, address, companyName },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }

    if (Array.isArray(lorries)) {
      const existingLorries = await Lorry.find({ owner: ownerId });
      const incomingIds = new Set(
        lorries
          .map((lorry) => lorry._id)
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
          .map((id) => id.toString())
      );

      const idsToDelete = existingLorries
        .filter((lorry) => !incomingIds.has(lorry._id.toString()))
        .map((lorry) => lorry._id);

      const usedLorryIds = await findLorriesUsedInAssignments(idsToDelete);
      if (usedLorryIds.length) {
        const usedNumbers = existingLorries
          .filter((lorry) =>
            usedLorryIds.some((id) => id.toString() === lorry._id.toString())
          )
          .map((lorry) => lorry.lorryNum)
          .filter(Boolean);
        return res.status(400).json({
          success: false,
          message: `Cannot remove ${usedNumbers.join(", ") || "these lorries"} because ${usedNumbers.length === 1 ? "it is" : "they are"} used in an assignment.`,
        });
      }

      if (idsToDelete.length) {
        await Lorry.deleteMany({ _id: { $in: idsToDelete } });
      }

      for (const lorry of lorries) {
        if (!lorry.lorryNum || !lorry.capacity) continue;

        if (lorry._id && mongoose.Types.ObjectId.isValid(lorry._id)) {
          await Lorry.findOneAndUpdate(
            { _id: lorry._id, owner: ownerId },
            { lorryNum: lorry.lorryNum, capacity: lorry.capacity },
            { runValidators: true }
          );
        } else {
          await Lorry.create({
            lorryNum: lorry.lorryNum,
            capacity: lorry.capacity,
            owner: ownerId,
          });
        }
      }
    }

    const updatedLorries = await markLorriesInUse(
      await Lorry.find({ owner: ownerId }).lean()
    );
    const data = { ...lorryOwner.toObject(), lorries: updatedLorries };
    syncLorryOwner(req, "updated", ownerId, data);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: formatSaveError(error) });
    }
    res.status(500).json({
      success: false,
      message: "Could not update the lorry owner. Please try again.",
    });
  }
};

exports.deleteLorryOwner = async (req, res) => {
  try {
    const { ownerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner ID" });
    }
    const lorries = await Lorry.find({ owner: ownerId }).select("_id lorryNum");
    const usedLorryIds = await findLorriesUsedInAssignments(
      lorries.map((lorry) => lorry._id)
    );

    if (usedLorryIds.length) {
      const usedNumbers = lorries
        .filter((lorry) =>
          usedLorryIds.some((id) => id.toString() === lorry._id.toString())
        )
        .map((lorry) => lorry.lorryNum)
        .filter(Boolean);
      return res.status(400).json({
        success: false,
        message: `Cannot delete this owner because ${usedNumbers.join(", ") || "one or more lorries"} ${usedNumbers.length === 1 ? "is" : "are"} used in an assignment.`,
      });
    }

    const lorryOwner = await LorryOwner.findByIdAndDelete(ownerId);
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }
    await Lorry.deleteMany({ owner: ownerId });
    syncLorryOwner(req, "deleted", ownerId, null);
    res
      .status(200)
      .json({ success: true, message: "Owner deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.addLorry = async (req, res) => {
  try {
    const { ownerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner ID" });
    }

    // Find the owner first
    const lorryOwner = await LorryOwner.findById(ownerId);
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }

    // Add the new lorry to the lorries array
    lorryOwner.lorries.push(req.body);
    await lorryOwner.save(); // Save the parent document to trigger validation and middleware

    ownerForSync(ownerId)
      .then((data) => syncLorryOwner(req, "updated", ownerId, data))
      .catch(() => {});
    res.status(201).json({ success: true, data: lorryOwner });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: formatSaveError(error) });
    }
    res.status(500).json({
      success: false,
      message: "Could not add the lorry. Please try again.",
    });
  }
};

exports.updateLorry = async (req, res) => {
  try {
    const { ownerId, lorryId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(ownerId) ||
      !mongoose.Types.ObjectId.isValid(lorryId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner or Lorry ID" });
    }

    const lorryOwner = await LorryOwner.findById(ownerId);
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }

    // Find the specific lorry sub-document
    const lorry = lorryOwner.lorries.id(lorryId);
    if (!lorry) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry not found" });
    }

    // Update the lorry's fields
    lorry.set(req.body);
    await lorryOwner.save();

    ownerForSync(ownerId)
      .then((data) => syncLorryOwner(req, "updated", ownerId, data))
      .catch(() => {});
    res.status(200).json({ success: true, data: lorryOwner });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: formatSaveError(error) });
    }
    res.status(500).json({
      success: false,
      message: "Could not update the lorry. Please try again.",
    });
  }
};

exports.removeLorry = async (req, res) => {
  try {
    const { ownerId, lorryId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(ownerId) ||
      !mongoose.Types.ObjectId.isValid(lorryId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner or Lorry ID" });
    }

    const lorry = await Lorry.findOne({ _id: lorryId, owner: ownerId })
      .select("lorryNum")
      .lean();
    if (!lorry) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry not found" });
    }

    const usedLorryIds = await findLorriesUsedInAssignments([lorryId]);
    if (usedLorryIds.length) {
      return res.status(400).json({
        success: false,
        message: `Cannot remove ${lorry.lorryNum} because it is used in an assignment.`,
      });
    }

    const deleted = await Lorry.findOneAndDelete({
      _id: lorryId,
      owner: ownerId,
    });
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry not found" });
    }

    const remaining = await Lorry.find({ owner: ownerId }).lean();
    ownerForSync(ownerId)
      .then((data) => syncLorryOwner(req, "updated", ownerId, data))
      .catch(() => {});
    res.status(200).json({
      success: true,
      message: "Lorry removed",
      data: remaining,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
