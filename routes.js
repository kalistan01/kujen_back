const express = require("express");
const router = express.Router()




router.use('/user', require('./controller/staff/staff/staff.routes'));
router.use('/role', require('./controller/staff/role/role.routes'));
router.use('/lorry', require('./controller/lorry/lorry.routes'));
router.use('/assignlorry', require('./controller/assignlorry/assignLorry.routes'));
router.use('/destination', require('./controller/destination/destination.routes'));


module.exports = router;