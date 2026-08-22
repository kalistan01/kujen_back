const mongoose = require("mongoose");

const heldUpSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, "Held up amount is required."],
      min: [0, "Held up amount cannot be negative."],
    },
    date: {
      type: String,
      required: [true, "Date is required."],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date."],
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

heldUpSchema.index({ status: 1, date: -1 });

const HeldUp = mongoose.models.HeldUp || mongoose.model("HeldUp", heldUpSchema);

module.exports = HeldUp;
