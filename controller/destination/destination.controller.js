const { Destination } = require("../../models");
const mongoose = require("mongoose");
const { emitChange } = require("../../lib/socket");

const DESTINATION_TYPES = ["Port", "Yard", "Store", "RCT", "Other"];

function formatSaveError(error) {
  if (error?.code === 11000) {
    return "A destination with this type and location already exists.";
  }

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

function findDuplicateDestination(type, location, excludeId) {
  const query = {
    type,
    location: { $regex: `^${escapeRegex(location.trim())}$`, $options: "i" },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Destination.findOne(query);
}

exports.createDestination = async (req, res) => {
  try {
    const type = String(req.body?.type || "").trim();
    const location = String(req.body?.location || "").trim();

    if (!type) {
      return sendError(res, 400, "Please select a destination type.");
    }
    if (!DESTINATION_TYPES.includes(type)) {
      return sendError(res, 400, `${type} is not a valid destination type.`);
    }
    if (!location) {
      return sendError(res, 400, "Location is required.");
    }

    const existing = await findDuplicateDestination(type, location);
    if (existing) {
      return sendError(
        res,
        400,
        `A ${type} destination at "${location}" already exists.`
      );
    }

    const destination = await Destination.create({ type, location });
    emitChange(req, {
      module: "destination",
      action: "created",
      id: destination._id,
      data: destination,
    });
    res.status(201).json({ success: true, data: destination });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not create the destination. Please try again.",
    });
  }
};

/**
 * @description Get all destinations
 * @route GET /api/destinations
 */

exports.getAllDestinations = async (req, res) => {
  try {
    const destinations = await Destination.find({});
    res
      .status(200)
      .json({ success: true, count: destinations.length, data: destinations });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load destinations. Please try again.",
    });
  }
};

/**
 * @description Get a single destination by ID
 * @route GET /api/destinations/:destinationId
 */

exports.getDestinationById = async (req, res) => {
  try {
    const { destinationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      return sendError(res, 400, "Invalid destination ID.");
    }
    const destination = await Destination.findById(destinationId);
    if (!destination) {
      return sendError(res, 404, "Destination not found.");
    }
    res.status(200).json({ success: true, data: destination });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load this destination. Please try again.",
    });
  }
};

/**
 * @description Update a destination
 * @route PUT /api/destinations/:destinationId
 */

exports.updateDestination = async (req, res) => {
  try {
    const { destinationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      return sendError(res, 400, "Invalid destination ID.");
    }

    const type = String(req.body?.type || "").trim();
    const location = String(req.body?.location || "").trim();

    if (!type) {
      return sendError(res, 400, "Please select a destination type.");
    }
    if (!DESTINATION_TYPES.includes(type)) {
      return sendError(res, 400, `${type} is not a valid destination type.`);
    }
    if (!location) {
      return sendError(res, 400, "Location is required.");
    }

    const existing = await findDuplicateDestination(
      type,
      location,
      destinationId
    );
    if (existing) {
      return sendError(
        res,
        400,
        `A ${type} destination at "${location}" already exists.`
      );
    }

    const destination = await Destination.findByIdAndUpdate(
      destinationId,
      { type, location },
      {
        new: true,
        runValidators: true,
      }
    );
    if (!destination) {
      return sendError(res, 404, "Destination not found.");
    }
    emitChange(req, {
      module: "destination",
      action: "updated",
      id: destination._id,
      data: destination,
    });
    res.status(200).json({ success: true, data: destination });
  } catch (error) {
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not update the destination. Please try again.",
    });
  }
};

/**
 * @description Delete a destination
 * @route DELETE /api/destinations/:destinationId
 */

exports.deleteDestination = async (req, res) => {
  try {
    const { destinationId } = req.params;
    const { status } = req.headers;
    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      return sendError(res, 400, "Invalid destination ID.");
    }
    const destination = await Destination.findByIdAndUpdate(
      destinationId,
      { status },
      { new: true }
    );
    if (!destination) {
      return sendError(res, 404, "Destination not found.");
    }
    emitChange(req, {
      module: "destination",
      action: "updated",
      id: destination._id,
      data: destination,
    });
    res.status(200).json({
      success: true,
      message: "Destination status updated successfully.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update the destination status. Please try again.",
    });
  }
};
