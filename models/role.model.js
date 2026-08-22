// role.model.js
const mongoose = require("mongoose");


const roleSchema = new mongoose.Schema(
  {
    roleName: {
      type: String,
      required: [true, "Role name is required."],
      trim: true,
    },
    permission: { type: [Number], default: [] },
    denied: { type: [Number], default: [] },
    status: { type: Boolean, default: true },
    admin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Explicitly set collection name to 'roles'
const roleModel = mongoose.models.Role || mongoose.model("Role", roleSchema);

module.exports = roleModel;
