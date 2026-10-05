const { Buyer } = require("../../models");
const mongoose = require("mongoose");
const { emitChange } = require("../../lib/socket");

function formatSaveError(error) {
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readBuyer(body) {
  return {
    name: String(body?.name || "").trim(),
    address: String(body?.address || "").trim(),
  };
}

function validateBuyer(buyer) {
  if (!buyer.name) return "Name is required.";
  if (buyer.name.length > 120) return "Name cannot be longer than 120 characters.";
  if (!buyer.address) return "Address is required.";
  if (buyer.address.length > 500) {
    return "Address cannot be longer than 500 characters.";
  }
  return "";
}

function findDuplicate(name, excludeId) {
  const query = {
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Buyer.findOne(query);
}

exports.createBuyer = async (req, res) => {
  try {
    const buyerInput = readBuyer(req.body);
    const message = validateBuyer(buyerInput);
    if (message) return sendError(res, 400, message);

    const existing = await findDuplicate(buyerInput.name);
    if (existing) {
      return sendError(
        res,
        400,
        `A buyer named "${buyerInput.name}" already exists.`
      );
    }

    const buyer = await Buyer.create(buyerInput);
    emitChange(req, {
      module: "buyer",
      action: "created",
      id: buyer._id,
      data: buyer,
    });
    res.status(201).json({ success: true, data: buyer });
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not create the buyer. Please try again.",
    });
  }
};

exports.getAllBuyers = async (req, res) => {
  try {
    const buyers = await Buyer.find({}).sort({ name: 1, createdAt: -1 });
    res.status(200).json({ success: true, count: buyers.length, data: buyers });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load buyers. Please try again.",
    });
  }
};

exports.getBuyerById = async (req, res) => {
  try {
    const { buyerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(buyerId)) {
      return sendError(res, 400, "Invalid buyer ID.");
    }
    const buyer = await Buyer.findById(buyerId);
    if (!buyer) return sendError(res, 404, "Buyer not found.");
    res.status(200).json({ success: true, data: buyer });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this buyer. Please try again.",
    });
  }
};

exports.updateBuyer = async (req, res) => {
  try {
    const { buyerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(buyerId)) {
      return sendError(res, 400, "Invalid buyer ID.");
    }

    const buyerInput = readBuyer(req.body);
    const message = validateBuyer(buyerInput);
    if (message) return sendError(res, 400, message);

    const existing = await findDuplicate(buyerInput.name, buyerId);
    if (existing) {
      return sendError(
        res,
        400,
        `A buyer named "${buyerInput.name}" already exists.`
      );
    }

    const buyer = await Buyer.findByIdAndUpdate(buyerId, buyerInput, {
      new: true,
      runValidators: true,
    });
    if (!buyer) return sendError(res, 404, "Buyer not found.");

    emitChange(req, {
      module: "buyer",
      action: "updated",
      id: buyer._id,
      data: buyer,
    });
    res.status(200).json({ success: true, data: buyer });
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not update the buyer. Please try again.",
    });
  }
};
