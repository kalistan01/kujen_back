const express = require("express");
const router = express.Router()

router.use('/user', require('./controller/staff/staff/staff.routes'));
router.use('/role', require('./controller/staff/role/role.routes'));
router.use('/lorry', require('./controller/lorry/lorry.routes'));
router.use('/assignlorry', require('./controller/assignlorry/assignLorry.routes'));
router.use('/destination', require('./controller/destination/destination.routes'));
router.use('/heldup', require('./controller/heldup/heldup.routes'));
router.use('/dashboard', require('./controller/dashboard/dashboad.routes'));
router.use('/logs', require('./controller/log/log.routes'));

module.exports = router;