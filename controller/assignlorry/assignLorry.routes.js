const express = require("express");
const router = express.Router();
const assignLorryController = require("./assignLorry.controller");
const { checkToken } = require("../../middleware/token");

router
  .post("/", checkToken, assignLorryController.createAssignLorry)
  .get("/",checkToken, assignLorryController.getAllAssignLorries);
router
  .get("/:id", checkToken,assignLorryController.getAssignLorryByIds)
  .delete("/:id", checkToken,assignLorryController.deleteAssignLorry)
  .patch("/:id", checkToken,assignLorryController.updateBasicinfo);
router.post("/:id/containers", checkToken,assignLorryController.addContainer);
router
  .delete("/:id/containers/:containerId", checkToken,assignLorryController.removeContainer)
  .patch(
    "/:id/containers/:containerId",checkToken,
    assignLorryController.updatedContainerStatus
  )
  .put(
    "/:id/containers/:containerId",checkToken,
    assignLorryController.updateContainerDetails
  );

module.exports = router;
