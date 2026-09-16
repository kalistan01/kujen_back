const mongoose = require("mongoose");

const lorrySchema = new mongoose.Schema(
  {
    lorryNum: {
      type: String,
      required: [true, "Lorry number is required."],
    },
    capacity: {
      type: String,
      required: [true, "Lorry capacity is required."],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LorryOwner",
      required: true,
    },
  },
  { timestamps: true }
);

lorrySchema.index({ lorryNum: 1, owner: 1 }, { unique: true });

const Lorry = mongoose.models.Lorry || mongoose.model("Lorry", lorrySchema);
module.exports = Lorry;
