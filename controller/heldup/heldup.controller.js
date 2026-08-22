const { HeldUp } = require("../../models");
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

function parseAmount(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : NaN;
}

function todayDate() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDate(value) {
  const raw = String(value || "").trim().substring(0, 10);
  if (!raw) return todayDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return raw;
}

exports.createHeldUp = async (req, res) => {
  try {
    const amount = parseAmount(req.body?.amount);
    const date = parseDate(req.body?.date);

    if (!Number.isFinite(amount)) {
      return sendError(res, 400, "Held up amount is required.");
    }
    if (amount < 0) {
      return sendError(res, 400, "Held up amount cannot be negative.");
    }
    if (!date) {
      return sendError(res, 400, "Please enter a valid date.");
    }

    await HeldUp.updateMany({ status: true }, { $set: { status: false } });
    const heldUp = await HeldUp.create({ amount, date, status: true });
    emitChange(req, {
      module: "heldup",
      action: "created",
      id: heldUp._id,
      data: heldUp,
    });
    res.status(201).json({ success: true, data: heldUp });
  } catch (error) {
    if (error.name === "ValidationError") {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not create the held up rate. Please try again.",
    });
  }
};

exports.getAllHeldUps = async (req, res) => {
  try {
    const heldUps = await HeldUp.find({}).sort({
      status: -1,
      date: -1,
      createdAt: -1,
    });
    res
      .status(200)
      .json({ success: true, count: heldUps.length, data: heldUps });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load held up rates. Please try again.",
    });
  }
};

exports.getActiveHeldUp = async (req, res) => {
  try {
    const heldUp = await HeldUp.findOne({ status: true }).sort({
      date: -1,
      createdAt: -1,
    });
    res.status(200).json({ success: true, data: heldUp });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load the active held up rate. Please try again.",
    });
  }
};

exports.getHeldUpById = async (req, res) => {
  try {
    const { heldUpId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(heldUpId)) {
      return sendError(res, 400, "Invalid held up ID.");
    }
    const heldUp = await HeldUp.findById(heldUpId);
    if (!heldUp) {
      return sendError(res, 404, "Held up rate not found.");
    }
    res.status(200).json({ success: true, data: heldUp });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this held up rate. Please try again.",
    });
  }
};
