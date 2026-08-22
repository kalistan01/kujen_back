const express = require("express");
const router = express.Router();
const { getLogs, getAssignmentLogs } = require("./log.controller");
const { checkToken } = require("../../middleware/token");
const { loadAuthRole, requireCan } = require("../../middleware/rbac");

router.get("/", checkToken, loadAuthRole, requireCan(10), getLogs);
router.get(
  "/assignment/:id",
  checkToken,
  loadAuthRole,
  getAssignmentLogs
);

module.exports = router;
