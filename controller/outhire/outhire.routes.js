const express = require("express");
const {
  createOutHire,
  getAllOutHires,
  getOutHireById,
  updateOutHire,
  deleteOutHire,
} = require("./outhire.controller.js");
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewOutHire = [...withRole, requireAny([5, 6, 7, 8, 14, 16, 17, 18, 19])];
const addOutHire = [...withRole, requireCan(7)];
const editOutHire = [...withRole, requireCan(14)];

router
  .route("/")
  .post(...addOutHire, createOutHire)
  .get(...viewOutHire, getAllOutHires);

router
  .route("/:outHireId")
  .get(...viewOutHire, getOutHireById)
  .put(...editOutHire, updateOutHire)
  .delete(...editOutHire, deleteOutHire);

module.exports = router;
