const express = require("express");

const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole } = require("../../middleware/rbac.js");
const { getCounts } = require("./dashboard.controller.js");

const router = express.Router();

router.route("/topcount").get(checkToken, loadAuthRole, getCounts);

   
module.exports = router;
