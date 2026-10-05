const express = require("express");
const {
  createBuyer,
  getAllBuyers,
  getBuyerById,
  updateBuyer,
} = require("./buyer.controller.js");
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewBuyer = [...withRole, requireAny([64, 65, 66])];
const addBuyer = [...withRole, requireCan(65)];
const editBuyer = [...withRole, requireCan(66)];

router.route("/").post(...addBuyer, createBuyer).get(...viewBuyer, getAllBuyers);

router
  .route("/:buyerId")
  .get(...viewBuyer, getBuyerById)
  .put(...editBuyer, updateBuyer);

module.exports = router;
