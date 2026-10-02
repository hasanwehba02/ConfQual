const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireRole } = require('../middleware/auth');

router.get('/', settingsController.getSettings);
router.post('/', requireRole('admin', 'chair'), settingsController.updateSettings);
router.put('/', requireRole('admin', 'chair'), settingsController.updateSettings);

module.exports = router;
