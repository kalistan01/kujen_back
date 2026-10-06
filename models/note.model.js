const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "shared",
      unique: true,
    },
    html: {
      type: String,
      default: "",
      maxlength: [100000, "Note is too long."],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Note = mongoose.models.Note || mongoose.model("Note", noteSchema);

module.exports = Note;
