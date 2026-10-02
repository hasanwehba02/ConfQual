const db = require('../config/database');
const workspaceService = require('../services/workspaceService');

function createWorkspaceMiddleware(resolve = workspaceService.resolveWorkspace) {
    return async function requireWorkspace(req, res, next) {
        if (!req.user?.sub) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            const membership = await resolve(req.user);
            if (!membership?.workspaceId) {
                return res.status(403).json({ error: 'Workspace access required' });
            }

            req.workspaceId = membership.workspaceId;
            req.workspaceRole = membership.role;
            return db.withWorkspace(req.workspaceId, () => next());
        } catch (error) {
            return next(error);
        }
    };
}

const requireWorkspace = createWorkspaceMiddleware();

module.exports = { createWorkspaceMiddleware, requireWorkspace };
