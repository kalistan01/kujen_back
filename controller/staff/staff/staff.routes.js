const express = require("express");
const { adminsignUp, adminlogIn, adminReset, createUser, getAllUsers, getUserById, updateUser, deleteUser } = require("./staff.controller");
const { checkToken } = require("../../../middleware/token");
const { loadAuthRole, requireCan, requireAny } = require("../../../middleware/rbac");
const router = express.Router();

router.route("/user-register").post(adminsignUp);
router.route("/user-login").post(adminlogIn);
router.route("/user-reset").patch(checkToken, loadAuthRole, requireCan(12), adminReset);
router.route('/')
    .post(checkToken, loadAuthRole, requireCan(2), createUser)
    .get(checkToken, loadAuthRole, requireAny([1, 2, 12]), getAllUsers);

router.route('/:userId')
    .get(checkToken, loadAuthRole, requireAny([1, 2, 12]), getUserById)
    .put(checkToken, loadAuthRole, requireCan(12), updateUser)
    .delete(checkToken, loadAuthRole, requireCan(12), deleteUser);

module.exports = router;
