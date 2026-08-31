const express = require("express");
const router = express.Router();
const assignLorryController = require("./assignLorry.controller");
const assignmentExport = require("./assignmentExport.controller");
const { checkToken } = require("../../middleware/token");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac");

const withRole = [checkToken, loadAuthRole];
const viewAssignment = [...withRole, requireAny([5, 8, 16])];
const addAssignment = [...withRole, requireCan(5)];
const editAssignment = [...withRole, requireCan(16)];

router
  .post("/", ...addAssignment, assignLorryController.createAssignLorry)
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
  .delete("/:id", ...editAssignment, assignLorryController.deleteAssignLorry)
  .patch("/:id", ...editAssignment, assignLorryController.updateBasicinfo);
router.patch(
  "/:id/pay-balances",
  ...editAssignment,
  assignLorryController.payContainersBalance
);
router.post("/:id/containers", ...editAssignment, assignLorryController.addContainer);
router
  .delete("/:id/containers/:containerId", ...editAssignment, assignLorryController.removeContainer)
  .patch(
    "/:id/containers/:containerId",
    ...editAssignment,
    assignLorryController.updatedContainerStatus
  )
  .patch(
    "/:id/containers/:containerId/balance",
    ...editAssignment,
    assignLorryController.payContainerBalance
  )
  .put(
    "/:id/containers/:containerId",
    ...editAssignment,
    assignLorryController.updateContainerDetails
  );

module.exports = router;
