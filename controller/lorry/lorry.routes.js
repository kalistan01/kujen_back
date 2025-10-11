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

const router = express.Router();

// --- Routes for Lorry Owners ---
router.route("/").post(createLorryOwner).get(getAllLorryOwners);
router
  .route("/lorry")
  .get(checkToken,getAllLorries);

router
  .route("/:ownerId")
  .get(checkToken,getLorryOwnerById)
  .put(checkToken,updateLorryOwner)
  .delete(checkToken,deleteLorryOwner);

// --- Routes for nested Lorries ---
router.route("/:ownerId/lorries").post(checkToken,addLorry);

router.route("/:ownerId/lorries/:lorryId").put(checkToken,updateLorry).delete(checkToken,removeLorry);

module.exports = router;
