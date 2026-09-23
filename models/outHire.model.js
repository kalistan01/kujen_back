const mongoose = require("mongoose");

const outHireSchema = new mongoose.Schema(
  {
    location: {
      type: String,
      required: [true, "Location is required."],
      trim: true,
    },
    distanceKm: {
      type: Number,
      required: [true, "Distance is required."],
      min: [0, "Distance cannot be negative."],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required."],
      min: [0, "Amount cannot be negative."],
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

outHireSchema.index({ location: 1, distanceKm: 1 });

const OutHire =
  mongoose.models.OutHire || mongoose.model("OutHire", outHireSchema);

module.exports = OutHire;
