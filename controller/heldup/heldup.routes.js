const express = require("express");
const {
  createHeldUp,
  getAllHeldUps,
  getActiveHeldUp,
  getHeldUpById,
} = require("./heldup.controller.js");
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewHeldUp = [...withRole, requireAny([5, 6, 7, 8, 14, 16])];
const addHeldUp = [...withRole, requireCan(7)];

router.route("/").post(...addHeldUp, createHeldUp).get(...viewHeldUp, getAllHeldUps);
router.route("/active").get(...viewHeldUp, getActiveHeldUp);
router.route("/:heldUpId").get(...viewHeldUp, getHeldUpById);

module.exports = router;
