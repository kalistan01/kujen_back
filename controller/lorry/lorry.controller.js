const { LorryOwner, Lorry, AssignLorry } = require("../../models");
const mongoose = require("mongoose");

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

    // Step 1: Create Owner
    const owner = new LorryOwner({
      ownerName,
      phoneNum,
      address,
      companyName,
      createdBy,
    });

    await owner.save();

    // Step 2: Create all lorries linked to this owner
    const lorryDocs = (lorries || []).map((lorry) => ({
      lorryNum: lorry.lorryNum,
      capacity: lorry.capacity,
      owner: owner._id, // link to owner
    }));

    const createdLorries = lorryDocs.length
      ? await Lorry.insertMany(lorryDocs)
      : [];

    res.status(201).json({
      success: true,
      owner,
      lorries: createdLorries,
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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
    res.status(200).json({ success: true, data: ownersWithLorries });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
exports.getAllLorries = async (req, res) => {
  try {
    const allLorries = await Lorry.find().populate({
      path: "owner",
      select: "ownerName",
    });
    res.status(200).json({
      success: true,
      count: allLorries.length,
      data: allLorries,
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
    res.status(200).json({ success: true, data: lorryOwner });
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
    res.status(200).json({
      success: true,
      data: { ...lorryOwner.toObject(), lorries: updatedLorries },
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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

    res.status(201).json({ success: true, data: lorryOwner });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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

    res.status(200).json({ success: true, data: lorryOwner });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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

    const usedLorryIds = await findLorriesUsedInAssignments([lorryId]);
    if (usedLorryIds.length) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove this lorry because it is used in an assignment.",
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
    res.status(200).json({
      success: true,
      message: "Lorry removed",
      data: remaining,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
