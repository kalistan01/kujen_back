const express = require("express");
const { addRole, findRole, updateRole, findRoleId, deactivateRole, activateRole } = require("./role.controller");
const { checkToken } = require("../../../middleware/token");
const { loadAuthRole, requireCan, requireAny } = require("../../../middleware/rbac");
const router = express.Router();

router.route("/addRole").post(checkToken, loadAuthRole, requireCan(9), addRole);
router.route("/findRole").get(checkToken, loadAuthRole, requireAny([2, 9, 11, 12, 15]), findRole);
router.route("/findRoleId").get(checkToken, loadAuthRole, requireAny([9, 11, 15]), findRoleId);
router.route("/updateRole").patch(checkToken, loadAuthRole, requireCan(15), updateRole);
router.route("/deactivateRole").patch(checkToken, loadAuthRole, requireCan(15), deactivateRole);
router.route("/activateRole").patch(checkToken, loadAuthRole, requireCan(15), activateRole);
module.exports = router;
