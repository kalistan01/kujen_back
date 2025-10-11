// role.model.js
const mongoose = require("mongoose");


const roleSchema = new mongoose.Schema(
  {
    roleName: { type: String, required: true },
    permission: { type: [Number] },
    denied: { type: [Number], required: true },
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
