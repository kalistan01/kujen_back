const { LorryOwner, Lorry } = require("../../models");
const mongoose = require("mongoose");

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
    const lorryDocs = lorries.map((lorry) => ({
      lorryNum: lorry.lorryNum,
      capacity: lorry.capacity,
      owner: owner._id, // link to owner
    }));

    const createdLorries = await Lorry.insertMany(lorryDocs);

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
    const lorries = await Lorry.find().lean();
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
    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Owner ID" });
    }
    const lorryOwner = await LorryOwner.findByIdAndUpdate(ownerId, req.body, {
      new: true, // Return the updated document
      runValidators: true, // Run schema validators on update
    });
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }
    res.status(200).json({ success: true, data: lorryOwner });
  } catch (error) {
    if (error.name === "ValidationError") {
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
    const lorryOwner = await LorryOwner.findByIdAndDelete(ownerId);
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }
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

    const lorryOwner = await LorryOwner.findById(ownerId);
    if (!lorryOwner) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry owner not found" });
    }

    // Find and remove the sub-document
    const lorry = lorryOwner.lorries.id(lorryId);
    if (!lorry) {
      return res
        .status(404)
        .json({ success: false, message: "Lorry not found" });
    }
    lorry.remove();
    await lorryOwner.save();

    res
      .status(200)
      .json({ success: true, message: "Lorry removed", data: lorryOwner });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
