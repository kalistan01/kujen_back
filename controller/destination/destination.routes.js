const express = require("express");;
const {
    createDestination,
    getAllDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination
} = require('./destination.controller.js');

const router = express.Router();

router.route('/')
    .post(createDestination)
    .get(getAllDestinations);

router.route('/:destinationId')
    .get(getDestinationById)
    .put(updateDestination)
    .delete(deleteDestination);
   
module.exports = router;
