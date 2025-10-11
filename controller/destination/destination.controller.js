const { Destination } = require("../../models");
const mongoose = require("mongoose");
exports.createDestination = async (req, res) => {
  try {
    const destination = await Destination.create(req.body);
    res.status(201).json({ success: true, data: destination });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid Destination ID" });
    }
    const destination = await Destination.findById(destinationId);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: "Destination not found" });
    }
    res.status(200).json({ success: true, data: destination });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid Destination ID" });
    }
    const destination = await Destination.findByIdAndUpdate(
      destinationId,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: "Destination not found" });
    }
    res.status(200).json({ success: true, data: destination });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server Error" });
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid Destination ID" });
    }
    const destination = await Destination.findByIdAndUpdate(destinationId, {
      status,
    },{
        new:true
    });
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: "Destination not found" });
    }
    res
      .status(200)
      .json({ success: true, message: "Destination deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
