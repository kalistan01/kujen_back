const express = require("express");;

const { checkToken } = require("../../middleware/token.js");
const { getCounts } = require("./dashboard.controller.js");

const router = express.Router();

router.route('/topcount')
    .get(checkToken,getCounts);

   
module.exports = router;
