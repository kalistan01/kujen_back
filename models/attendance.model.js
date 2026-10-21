const mongoose = require("mongoose");

const ATTENDANCE_STATUSES = ["present", "absent", "leave", "half_day"];

const attendanceSchema = new mongoose.Schema(
  {
    staffMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffMember",
      required: [true, "Staff member is required."],
    },
    date: {
      type: Date,
      required: [true, "Date is required."],
    },
    status: {
      type: String,
      enum: {
        values: ATTENDANCE_STATUSES,
        message: "Status must be present, absent, leave, or half_day.",
      },
      required: [true, "Status is required."],
    },
    checkIn: {
      type: Date,
      default: null,
    },
    checkOut: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, "Note cannot be longer than 500 characters."],
      default: "",
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ staffMemberId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

const Attendance =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);

module.exports = Attendance;
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
