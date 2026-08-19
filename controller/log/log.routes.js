const express = require("express");
const router = express.Router();
const { getLogs } = require("./log.controller");
const { checkToken } = require("../../middleware/token");
const { requireAdmin } = require("../../middleware/requireAdmin");

router.get("/", checkToken, requireAdmin, getLogs);

module.exports = router;
