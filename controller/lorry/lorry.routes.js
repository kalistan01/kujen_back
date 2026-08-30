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
const viewFleet = [...withRole, requireAny([3, 4, 5, 8])];
const manageFleet = [...withRole, requireCan(4)];

router.route("/").post(...manageFleet, createLorryOwner).get(...viewFleet, getAllLorryOwners);
router.route("/lorry").get(...viewFleet, getAllLorries);

router
  .route("/:ownerId")
  .get(...viewFleet, getLorryOwnerById)
  .put(...manageFleet, updateLorryOwner)
  .delete(...manageFleet, deleteLorryOwner);

router.route("/:ownerId/lorries").post(...manageFleet, addLorry);

router
  .route("/:ownerId/lorries/:lorryId")
  .put(...manageFleet, updateLorry)
  .delete(...manageFleet, removeLorry);

module.exports = router;
