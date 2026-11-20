const db = require('../config/database');
const supportAccess = require('../services/supportAccessService');
const { hasVerifiedTotp } = require('./auth');

function createSupportWorkspaceMiddleware(
    workspaceMiddleware,
    authorizeRequest = supportAccess.authorizeRequest
) {
    return (scope) => async (req, res, next) => {
        const token = req.get('x-support-token');
        if (!token) return workspaceMiddleware(req, res, next);
        if (req.user?.aal !== 'aal2' || !hasVerifiedTotp(req.user)) {
            return res.status(403).json({ error: 'Multi-factor authentication required', code: 'mfa_required' });
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            return res.status(403).json({ error: 'Support access is read-only' });
        }

        try {
            const access = await authorizeRequest({
                token,
                actorUserId: req.user?.sub,
                scope,
                method: req.method,
                // Record the API area only; URLs can contain record IDs or secrets.
                path: req.baseUrl
            });
            if (!access) {
                return res.status(403).json({ error: 'Support access denied' });
            }
            req.workspaceId = access.workspaceId;
            req.workspaceRole = 'viewer';
            req.supportAccess = { grantId: access.grantId, actorUserId: req.user.sub };
            return db.withReadOnlyWorkspace(access.workspaceId, () => next());
        } catch (error) {
            return next(error);
        }
    };
}

module.exports = { createSupportWorkspaceMiddleware };
