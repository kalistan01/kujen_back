const express = require("express");
const router = express.Router();
const assignLorryController = require("./assignLorry.controller");
const assignmentExport = require("./assignmentExport.controller");
const { checkToken } = require("../../middleware/token");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac");

const withRole = [checkToken, loadAuthRole];
const viewAssignment = [...withRole, requireAny([5, 8, 16, 17, 18, 19])];
const addAssignment = [...withRole, requireCan(5)];
const editAssignment = [...withRole, requireCan(16)];
const addContainer = [...withRole, requireCan(18)];
const editContainer = [...withRole, requireCan(19)];
const viewContainers = [...withRole, requireCan(17)];

router
  .post("/", ...addAssignment, assignLorryController.createAssignLorry)
  .get("/", ...viewAssignment, assignLorryController.getAllAssignLorries);
router.get(
  "/export/pdf",
  ...viewAssignment,
  assignmentExport.exportAssignmentsPdf
);
router.get(
  "/export/excel",
  ...viewAssignment,
  assignmentExport.exportAssignmentsExcel
);
router.post(
  "/export/containers/pdf",
  ...viewContainers,
  assignmentExport.exportSelectedContainersPdf
);
router.get("/next-voc", ...viewAssignment, assignLorryController.getNextVocNo);
router.get(
  "/:id/export/pdf",
  ...viewAssignment,
  assignmentExport.exportAssignmentPdf
);
router.get(
  "/:id/export/excel",
  ...viewAssignment,
  assignmentExport.exportAssignmentExcel
);
router
  .get("/:id", ...viewAssignment, assignLorryController.getAssignLorryByIds)
  .delete("/:id", ...editAssignment, assignLorryController.deleteAssignLorry)
  .patch("/:id", ...editAssignment, assignLorryController.updateBasicinfo);
router.patch(
  "/:id/pay-balances",
  ...editContainer,
  assignLorryController.payContainersBalance
);
router.post("/:id/containers", ...addContainer, assignLorryController.addContainer);
router
  .delete("/:id/containers/:containerId", ...editContainer, assignLorryController.removeContainer)
  .patch(
    "/:id/containers/:containerId",
    ...editContainer,
    assignLorryController.updatedContainerStatus
  )
  .patch(
    "/:id/containers/:containerId/balance",
    ...editContainer,
    assignLorryController.payContainerBalance
  )
  .put(
    "/:id/containers/:containerId",
    ...editContainer,
    assignLorryController.updateContainerDetails
  );

module.exports = router;
