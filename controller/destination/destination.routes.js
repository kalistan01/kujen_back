const express = require("express");
const {
    createDestination,
    getAllDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination
} = require('./destination.controller.js');
const { checkToken } = require("../../middleware/token.js");
const { loadAuthRole, requireCan, requireAny } = require("../../middleware/rbac.js");

const router = express.Router();
const withRole = [checkToken, loadAuthRole];
const viewDestination = [...withRole, requireAny([5, 6, 7, 8, 14])];
const addDestination = [...withRole, requireCan(7)];
const editDestination = [...withRole, requireCan(14)];

router.route('/')
    .post(...addDestination, createDestination)
    .get(...viewDestination, getAllDestinations);

router.route('/:destinationId')
    .get(...viewDestination, getDestinationById)
    .put(...editDestination, updateDestination)
    .delete(...editDestination, deleteDestination);

module.exports = router;
