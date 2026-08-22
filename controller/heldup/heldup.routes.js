const express = require("express");
const {
  createHeldUp,
  getAllHeldUps,
  getActiveHeldUp,
  getHeldUpById,
} = require("./heldup.controller.js");
const { checkToken } = require("../../middleware/token.js");

const router = express.Router();

router.route("/").post(checkToken, createHeldUp).get(checkToken, getAllHeldUps);
router.route("/active").get(checkToken, getActiveHeldUp);
router.route("/:heldUpId").get(checkToken, getHeldUpById);

module.exports = router;
