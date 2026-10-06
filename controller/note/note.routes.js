const express = require("express");
const { getNote, saveNote } = require("./note.controller.js");
const { checkToken } = require("../../middleware/token.js");

const router = express.Router();

router.route("/").get(checkToken, getNote).put(checkToken, saveNote);

module.exports = router;
