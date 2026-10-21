const { Attendance, StaffMember } = require("../../models");
const mongoose = require("mongoose");
const { emitChange } = require("../../lib/socket");
const { ATTENDANCE_STATUSES } = require("../../models/attendance.model");

function formatSaveError(error) {
  if (error?.name === "ValidationError") {
    const messages = Object.values(error.errors || {})
      .map((item) => item.message)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  if (error?.code === 11000) {
    return "Attendance for this staff member on that date already exists.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function parseDay(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseDateTime(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function populateAttendance(query) {
  return query
    .populate("staffMemberId", "name phone status userId")
    .populate("markedBy", "fullName email");
}

function readAttendanceRow(body, { requireStaff = true } = {}) {
  const staffMemberId = body?.staffMemberId
    ? String(body.staffMemberId).trim()
    : "";
  const status = String(body?.status || "").trim().toLowerCase();
  const note = String(body?.note || "").trim();
  const checkIn = parseDateTime(body?.checkIn);
  const checkOut = parseDateTime(body?.checkOut);

  return {
    staffMemberId,
    status,
    note,
    checkIn,
    checkOut,
    requireStaff,
  };
}

function validateRow(row, date) {
  if (!date) return "Date is required (YYYY-MM-DD).";
  if (row.requireStaff) {
    if (!row.staffMemberId) return "Staff member is required.";
    if (!mongoose.Types.ObjectId.isValid(row.staffMemberId)) {
      return "Invalid staff member ID.";
    }
  }
  if (!ATTENDANCE_STATUSES.includes(row.status)) {
    return "Status must be present, absent, leave, or half_day.";
  }
  if (row.note.length > 500) {
    return "Note cannot be longer than 500 characters.";
  }
  if (row.checkIn === undefined) return "Invalid check-in time.";
  if (row.checkOut === undefined) return "Invalid check-out time.";

  const clearsTimes = row.status === "absent" || row.status === "leave";
  let checkIn = clearsTimes ? null : row.checkIn;
  let checkOut = clearsTimes ? null : row.checkOut;

  if (checkIn && checkOut && checkOut.getTime() < checkIn.getTime()) {
    return "Check-out cannot be before check-in.";
  }

  return { checkIn, checkOut };
}

async function upsertOne({ staffMemberId, date, status, note, checkIn, checkOut, markedBy }) {
  const staff = await StaffMember.findById(staffMemberId).select("_id");
  if (!staff) {
    const err = new Error("Staff member not found.");
    err.status = 404;
    throw err;
  }

  const record = await Attendance.findOneAndUpdate(
    { staffMemberId, date },
    {
      staffMemberId,
      date,
      status,
      note,
      checkIn,
      checkOut,
      markedBy: markedBy || null,
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  return populateAttendance(Attendance.findById(record._id));
}

exports.getAttendance = async (req, res) => {
  try {
    const filter = {};

    if (req.query.date) {
      const day = parseDay(req.query.date);
      if (!day) return sendError(res, 400, "Invalid date. Use YYYY-MM-DD.");
      filter.date = day;
    } else {
      const from = req.query.from ? parseDay(req.query.from) : null;
      const to = req.query.to ? parseDay(req.query.to) : null;
      if (req.query.from && !from) {
        return sendError(res, 400, "Invalid from date. Use YYYY-MM-DD.");
      }
      if (req.query.to && !to) {
        return sendError(res, 400, "Invalid to date. Use YYYY-MM-DD.");
      }
      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = from;
        if (to) filter.date.$lte = to;
      }
    }

    if (req.query.staffMemberId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.staffMemberId)) {
        return sendError(res, 400, "Invalid staff member ID.");
      }
      filter.staffMemberId = req.query.staffMemberId;
    }

    const records = await populateAttendance(
      Attendance.find(filter).sort({ date: -1, createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load attendance. Please try again.",
    });
  }
};

exports.upsertAttendance = async (req, res) => {
  try {
    const date = parseDay(req.body?.date);
    const row = readAttendanceRow(req.body);
    const validated = validateRow(row, date);
    if (typeof validated === "string") return sendError(res, 400, validated);

    const markedBy = req.tokenData?.userid || null;
    const populated = await upsertOne({
      staffMemberId: row.staffMemberId,
      date,
      status: row.status,
      note: row.note,
      checkIn: validated.checkIn,
      checkOut: validated.checkOut,
      markedBy,
    });

    emitChange(req, {
      module: "attendance",
      action: "updated",
      id: populated._id,
      data: populated,
    });

    res.status(200).json({ success: true, data: populated });
  } catch (error) {
    if (error.status === 404) return sendError(res, 404, error.message);
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not save attendance. Please try again.",
    });
  }
};

exports.bulkUpsertAttendance = async (req, res) => {
  try {
    const date = parseDay(req.body?.date);
    if (!date) return sendError(res, 400, "Date is required (YYYY-MM-DD).");

    const rows = Array.isArray(req.body?.records) ? req.body.records : null;
    if (!rows || rows.length === 0) {
      return sendError(res, 400, "At least one attendance record is required.");
    }

    const markedBy = req.tokenData?.userid || null;
    const saved = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = readAttendanceRow(rows[i]);
      const validated = validateRow(row, date);
      if (typeof validated === "string") {
        return sendError(res, 400, `Row ${i + 1}: ${validated}`);
      }

      const populated = await upsertOne({
        staffMemberId: row.staffMemberId,
        date,
        status: row.status,
        note: row.note,
        checkIn: validated.checkIn,
        checkOut: validated.checkOut,
        markedBy,
      });
      saved.push(populated);

      emitChange(req, {
        module: "attendance",
        action: "updated",
        id: populated._id,
        data: populated,
      });
    }

    res.status(200).json({
      success: true,
      count: saved.length,
      data: saved,
    });
  } catch (error) {
    if (error.status === 404) return sendError(res, 404, error.message);
    if (error.name === "ValidationError" || error.code === 11000) {
      return sendError(res, 400, formatSaveError(error));
    }
    res.status(500).json({
      success: false,
      message: "Could not save attendance. Please try again.",
    });
  }
};
