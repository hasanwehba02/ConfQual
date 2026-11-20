const express = require('express');
const { requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const supportAccess = require('../services/supportAccessService');

const router = express.Router();
router.use(requireRole('admin'));

router.post('/grants', asyncHandler(async (req, res) => {
    const grant = await supportAccess.createGrant({
        workspaceId: req.workspaceId,
        actorUserId: req.user.sub,
        input: req.body
    });
    if (!grant) return res.status(400).json({ error: 'Invalid support grant' });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json(grant);
}));

router.get('/grants', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await supportAccess.listGrants(req.workspaceId));
}));

router.get('/audit', asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await supportAccess.listAudit(req.workspaceId));
}));

router.delete('/grants/:id', asyncHandler(async (req, res) => {
    const revoked = await supportAccess.revokeGrant({
        workspaceId: req.workspaceId,
        grantId: req.params.id,
        actorUserId: req.user.sub
    });
    return revoked ? res.sendStatus(204) : res.status(404).json({ error: 'Support grant not found' });
}));

module.exports = router;
