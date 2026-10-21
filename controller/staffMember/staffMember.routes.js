const express = require("express");
const {
  createStaffMember,
  getAllStaffMembers,
  getStaffMemberById,
  updateStaffMember,
} = require("./staffMember.controller.js");
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewStaff = [...withRole, requireAny([67, 68, 69])];
// Attendance page needs active staff for the daily roster
const viewStaffOrAttendance = [...withRole, requireAny([67, 68, 69, 70, 71])];
const addStaff = [...withRole, requireCan(68)];
const editStaff = [...withRole, requireCan(69)];

router
  .route("/")
  .post(...addStaff, createStaffMember)
  .get(...viewStaffOrAttendance, getAllStaffMembers);

router
  .route("/:staffMemberId")
  .get(...viewStaff, getStaffMemberById)
  .put(...editStaff, updateStaffMember);

module.exports = router;
