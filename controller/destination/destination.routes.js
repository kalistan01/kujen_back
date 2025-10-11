const express = require("express");;
const {
    createDestination,
    getAllDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination
} = require('./destination.controller.js');
const { checkToken } = require("../../middleware/token.js");

const router = express.Router();

router.route('/')
    .post(checkToken,createDestination)
    .get(checkToken,getAllDestinations);

router.route('/:destinationId')
    .get(checkToken,getDestinationById)
    .put(checkToken,updateDestination)
    .delete(checkToken,deleteDestination);
   
module.exports = router;
