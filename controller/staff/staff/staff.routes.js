const express = require("express");
const { adminsignUp, adminlogIn, adminReset, createUser, getAllUsers, getUserById, updateUser, deleteUser } = require("./staff.controller");
const { checkToken } = require("../../../middleware/token");
const router = express.Router();

router.route("/user-register").post(adminsignUp);
router.route("/user-login").post(adminlogIn);
router.route("/user-reset").patch(adminReset);
router.route('/')
    .post(checkToken,createUser)
    .get(checkToken,getAllUsers);

router.route('/:userId')
    .get(checkToken,getUserById)
    .put(checkToken,updateUser)
    .delete(checkToken,deleteUser);

module.exports = router;
