const express = require("express");
const {
  getAttendance,
  upsertAttendance,
  bulkUpsertAttendance,
} = require("./attendance.controller.js");
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewAttendance = [...withRole, requireAny([70, 71])];
const markAttendance = [...withRole, requireCan(71)];

router
  .route("/")
  .get(...viewAttendance, getAttendance)
  .put(...markAttendance, upsertAttendance);

router.route("/bulk").put(...markAttendance, bulkUpsertAttendance);

module.exports = router;
