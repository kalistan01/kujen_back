const express = require("express");
const { addRole, findRole, updateRole, findRoleId, deactivateRole, activateRole } = require(".//role.controller");
const { checkToken } = require("../../../middleware/token");
const { loadAuthRole, requireCan } = require("../../../middleware/rbac");
const router = express.Router();

router.route("/addRole").post(checkToken, loadAuthRole, requireCan(9), addRole);
router.route("/findRole").get(checkToken, loadAuthRole, findRole);
router.route("/findRoleId").get(checkToken, loadAuthRole, requireCan(9), findRoleId);
router.route("/updateRole").patch(checkToken, loadAuthRole, requireCan(9), updateRole);
router.route("/deactivateRole").patch(checkToken, loadAuthRole, requireCan(9), deactivateRole);
router.route("/activateRole").patch(checkToken, loadAuthRole, requireCan(9), activateRole);
module.exports = router;