const mongoose = require("mongoose");

const buyerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      maxlength: [120, "Name cannot be longer than 120 characters."],
    },
    address: {
      type: String,
      required: [true, "Address is required."],
      trim: true,
      maxlength: [500, "Address cannot be longer than 500 characters."],
    },
  },
  { timestamps: true }
);

buyerSchema.index({ name: 1 });

const Buyer = mongoose.models.Buyer || mongoose.model("Buyer", buyerSchema);

module.exports = Buyer;
