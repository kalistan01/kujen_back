const express = require("express");
const router = express.Router();
const assignLorryController = require("./assignLorry.controller");
const assignmentExport = require("./assignmentExport.controller");
const { checkToken } = require("../../middleware/token");

router
  .post("/", checkToken, assignLorryController.createAssignLorry)
  .get("/", checkToken, assignLorryController.getAllAssignLorries);
router.get(
  "/export/pdf",
  checkToken,
  assignmentExport.exportAssignmentsPdf
);
router.get(
  "/export/excel",
  checkToken,
  assignmentExport.exportAssignmentsExcel
);
router.get(
  "/:id/export/pdf",
  checkToken,
  assignmentExport.exportAssignmentPdf
);
router.get(
  "/:id/export/excel",
  checkToken,
  assignmentExport.exportAssignmentExcel
);
router
  .get("/:id", checkToken,assignLorryController.getAssignLorryByIds)
  .delete("/:id", checkToken,assignLorryController.deleteAssignLorry)
  .patch("/:id", checkToken,assignLorryController.updateBasicinfo);
router.patch(
  "/:id/pay-balances",
  checkToken,
  assignLorryController.payContainersBalance
);
router.post("/:id/containers", checkToken,assignLorryController.addContainer);
router
  .delete("/:id/containers/:containerId", checkToken,assignLorryController.removeContainer)
  .patch(
    "/:id/containers/:containerId",checkToken,
    assignLorryController.updatedContainerStatus
  )
  .patch(
    "/:id/containers/:containerId/balance",
    checkToken,
    assignLorryController.payContainerBalance
  )
  .put(
    "/:id/containers/:containerId",checkToken,
    assignLorryController.updateContainerDetails
  );

module.exports = router;
