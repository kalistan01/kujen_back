const express = require("express");
const { addRole, findRole, updateRole, findRoleId, deactivateRole, activateRole } = require(".//role.controller");
const { checkToken } = require("../../../middleware/token");
const router = express.Router();

router.route("/addRole").post(checkToken,addRole);
router.route("/findRole").get(checkToken,findRole);
router.route("/findRoleId").get(checkToken,findRoleId);
router.route("/updateRole").patch(checkToken,updateRole);
router.route("/deactivateRole").patch(checkToken,deactivateRole);
router.route("/activateRole").patch(checkToken,activateRole);
module.exports = router;