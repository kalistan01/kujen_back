const express = require("express");
const router = express.Router();
const { getLogs } = require("./log.controller");
const { checkToken } = require("../../middleware/token");
const { loadAuthRole, requireCan } = require("../../middleware/rbac");

router.get("/", checkToken, loadAuthRole, requireCan(10), getLogs);

module.exports = router;
