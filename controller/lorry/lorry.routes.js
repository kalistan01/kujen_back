const express = require("express");
const {
  createLorryOwner,
  getAllLorryOwners,
  getLorryOwnerById,
  updateLorryOwner,
  deleteLorryOwner,
  addLorry,
  updateLorry,
  removeLorry,
  getAllLorries,
} = require("./lorry.controller.js");
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewFleet = [...withRole, requireAny([3, 4, 5, 8, 13, 16])];
const addFleet = [...withRole, requireCan(4)];
const editFleet = [...withRole, requireCan(13)];

router.route("/").post(...addFleet, createLorryOwner).get(...viewFleet, getAllLorryOwners);
router.route("/lorry").get(...viewFleet, getAllLorries);

router
  .route("/:ownerId")
  .get(...viewFleet, getLorryOwnerById)
  .put(...editFleet, updateLorryOwner)
  .delete(...editFleet, deleteLorryOwner);

router.route("/:ownerId/lorries").post(...editFleet, addLorry);

router
  .route("/:ownerId/lorries/:lorryId")
  .put(...editFleet, updateLorry)
  .delete(...editFleet, removeLorry);

module.exports = router;
