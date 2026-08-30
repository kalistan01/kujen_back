const express = require("express");
const router = express.Router();
const assignLorryController = require("./assignLorry.controller");
const assignmentExport = require("./assignmentExport.controller");
const { checkToken } = require("../../middleware/token");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac");

const withRole = [checkToken, loadAuthRole];
const viewAssignment = [...withRole, requireAny([5, 8])];
const manageAssignment = [...withRole, requireCan(5)];

router
  .post("/", ...manageAssignment, assignLorryController.createAssignLorry)
  .get("/", ...viewAssignment, assignLorryController.getAllAssignLorries);
router.get(
  "/export/pdf",
  ...withRole,
  assignmentExport.exportAssignmentsPdf
);
router.get(
  "/export/excel",
  ...withRole,
  assignmentExport.exportAssignmentsExcel
);
router.post(
  "/export/containers/pdf",
  ...withRole,
  assignmentExport.exportSelectedContainersPdf
);
router.get("/next-voc", ...viewAssignment, assignLorryController.getNextVocNo);
router.get(
  "/:id/export/pdf",
  ...withRole,
  assignmentExport.exportAssignmentPdf
);
router.get(
  "/:id/export/excel",
  ...withRole,
  assignmentExport.exportAssignmentExcel
);
router
  .get("/:id", ...viewAssignment, assignLorryController.getAssignLorryByIds)
  .delete("/:id", ...manageAssignment, assignLorryController.deleteAssignLorry)
  .patch("/:id", ...manageAssignment, assignLorryController.updateBasicinfo);
router.patch(
  "/:id/pay-balances",
  ...manageAssignment,
  assignLorryController.payContainersBalance
);
router.post("/:id/containers", ...manageAssignment, assignLorryController.addContainer);
router
  .delete("/:id/containers/:containerId", ...manageAssignment, assignLorryController.removeContainer)
  .patch(
    "/:id/containers/:containerId",
    ...manageAssignment,
    assignLorryController.updatedContainerStatus
  )
  .patch(
    "/:id/containers/:containerId/balance",
    ...manageAssignment,
    assignLorryController.payContainerBalance
  )
  .put(
    "/:id/containers/:containerId",
    ...manageAssignment,
    assignLorryController.updateContainerDetails
  );

module.exports = router;
