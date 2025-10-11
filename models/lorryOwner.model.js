const mongoose = require("mongoose");

const lorryOwnerSchema = new mongoose.Schema(
  {
    ownerName: { type: String, required: true, trim: true },
    phoneNum: { type: String, default: "0000000000", trim: true },
    address: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const LorryOwner =
  mongoose.models.LorryOwner || mongoose.model("LorryOwner", lorryOwnerSchema);

module.exports = LorryOwner;
