const mongoose = require("mongoose");

const staffMemberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
      maxlength: [120, "Name cannot be longer than 120 characters."],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [40, "Phone cannot be longer than 40 characters."],
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot be longer than 500 characters."],
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

staffMemberSchema.index({ name: 1 });
staffMemberSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: "objectId" } },
  }
);

const StaffMember =
  mongoose.models.StaffMember ||
  mongoose.model("StaffMember", staffMemberSchema);

module.exports = StaffMember;
