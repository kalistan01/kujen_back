const { OutHire } = require("../../models");
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

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : NaN;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDuplicate(location, distanceKm, excludeId) {
  const query = {
    location: { $regex: `^${escapeRegex(location.trim())}$`, $options: "i" },
    distanceKm,
  };
  if (excludeId) query._id = { $ne: excludeId };
  return OutHire.findOne(query);
}

exports.createOutHire = async (req, res) => {
  try {
    const location = String(req.body?.location || "").trim();
    const distanceKm = parseNumber(req.body?.distanceKm);
    const amount = parseNumber(req.body?.amount);

    if (!location) {
      return sendError(res, 400, "Location is required.");
    }
    if (!Number.isFinite(distanceKm)) {
      return sendError(res, 400, "Distance is required.");
    }
    if (distanceKm < 0) {
      return sendError(res, 400, "Distance cannot be negative.");
    }
    if (!Number.isFinite(amount)) {
      return sendError(res, 400, "Amount is required.");
    }
    if (amount < 0) {
      return sendError(res, 400, "Amount cannot be negative.");
    }

    const existing = await findDuplicate(location, distanceKm);
    if (existing) {
      return sendError(
        res,
        400,
        `An out hire for "${location}" at ${distanceKm} km already exists.`
      );
    }

    const outHire = await OutHire.create({ location, distanceKm, amount });
    emitChange(req, {
      module: "outhire",
      action: "created",
      id: outHire._id,
      data: outHire,
    });
    res.status(201).json({ success: true, data: outHire });
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not create the out hire. Please try again.",
    });
  }
};

exports.getAllOutHires = async (req, res) => {
  try {
    const outHires = await OutHire.find({}).sort({
      location: 1,
      distanceKm: 1,
      createdAt: -1,
    });
    res
      .status(200)
      .json({ success: true, count: outHires.length, data: outHires });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load out hires. Please try again.",
    });
  }
};

exports.getOutHireById = async (req, res) => {
  try {
    const { outHireId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(outHireId)) {
      return sendError(res, 400, "Invalid out hire ID.");
    }
    const outHire = await OutHire.findById(outHireId);
    if (!outHire) {
      return sendError(res, 404, "Out hire not found.");
    }
    res.status(200).json({ success: true, data: outHire });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this out hire. Please try again.",
    });
  }
};

exports.updateOutHire = async (req, res) => {
  try {
    const { outHireId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(outHireId)) {
      return sendError(res, 400, "Invalid out hire ID.");
    }

    const location = String(req.body?.location || "").trim();
    const distanceKm = parseNumber(req.body?.distanceKm);
    const amount = parseNumber(req.body?.amount);

    if (!location) {
      return sendError(res, 400, "Location is required.");
    }
    if (!Number.isFinite(distanceKm)) {
      return sendError(res, 400, "Distance is required.");
    }
    if (distanceKm < 0) {
      return sendError(res, 400, "Distance cannot be negative.");
    }
    if (!Number.isFinite(amount)) {
      return sendError(res, 400, "Amount is required.");
    }
    if (amount < 0) {
      return sendError(res, 400, "Amount cannot be negative.");
    }

    const existing = await findDuplicate(location, distanceKm, outHireId);
    if (existing) {
      return sendError(
        res,
        400,
        `An out hire for "${location}" at ${distanceKm} km already exists.`
      );
    }

    const outHire = await OutHire.findByIdAndUpdate(
      outHireId,
      { location, distanceKm, amount },
      { new: true, runValidators: true }
    );
    if (!outHire) {
      return sendError(res, 404, "Out hire not found.");
    }
    emitChange(req, {
      module: "outhire",
      action: "updated",
      id: outHire._id,
      data: outHire,
    });
    res.status(200).json({ success: true, data: outHire });
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not update the out hire. Please try again.",
    });
  }
};

exports.deleteOutHire = async (req, res) => {
  try {
    const { outHireId } = req.params;
    const { status } = req.headers;
    if (!mongoose.Types.ObjectId.isValid(outHireId)) {
      return sendError(res, 400, "Invalid out hire ID.");
    }
    const outHire = await OutHire.findByIdAndUpdate(
      outHireId,
      { status },
      { new: true }
    );
    if (!outHire) {
      return sendError(res, 404, "Out hire not found.");
    }
    emitChange(req, {
      module: "outhire",
      action: "updated",
      id: outHire._id,
      data: outHire,
    });
    res.status(200).json({
      success: true,
      message: "Out hire status updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update the out hire status. Please try again.",
    });
  }
};
