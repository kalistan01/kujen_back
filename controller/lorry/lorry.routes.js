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

const router = express.Router();

// --- Routes for Lorry Owners ---
router.route("/").post(createLorryOwner).get(getAllLorryOwners);
router
  .route("/lorry")
  .get(getAllLorries);

router
  .route("/:ownerId")
  .get(getLorryOwnerById)
  .put(updateLorryOwner)
  .delete(deleteLorryOwner);

// --- Routes for nested Lorries ---
router.route("/:ownerId/lorries").post(addLorry);

router.route("/:ownerId/lorries/:lorryId").put(updateLorry).delete(removeLorry);

module.exports = router;
