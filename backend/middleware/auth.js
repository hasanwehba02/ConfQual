const { createClient } = require('@supabase/supabase-js');
const db = require('../config/database');

let supabase;

function getSupabase() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
        return null;
    }

    if (!supabase) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_PUBLISHABLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        );
    }

    return supabase;
}

function createAuthMiddleware(getClaims, getUser) {
    return async function requireAuth(req, res, next) {
        const header = req.get('authorization');
        const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            const { data, error } = await getClaims(token);
            const claims = data?.claims;

            const sessionId = claims?.session_id;
            if (error || !claims?.sub || typeof sessionId !== 'string' ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ||
                sessionId === '00000000-0000-0000-0000-000000000000') {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }

            // getClaims verifies the JWT but cannot detect a signed-out session.
            // Supabase's user endpoint checks the session against its auth store.
            const verifiedUser = await getUser(token);
            if (verifiedUser.error || verifiedUser.data?.user?.id !== claims.sub) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }

            req.user = claims;
            req.authUser = verifiedUser.data.user;
            next();
        } catch (error) {
            next(error);
        }
    };
}

const requireAuth = async (req, res, next) => {
    const client = getSupabase();
    if (!client) {
        return res.status(503).json({ error: 'Authentication is not configured' });
    }

    return createAuthMiddleware(
        (token) => client.auth.getClaims(token),
        (token) => client.auth.getUser(token)
    )(req, res, next);
};

function getRole(claims) {
    return claims?.workspaceRole || claims?.app_metadata?.role || 'viewer';
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const roleSource = req.workspaceRole
            ? { workspaceRole: req.workspaceRole }
            : req.user;
        if (!allowedRoles.includes(getRole(roleSource))) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        next();
    };
}

function hasVerifiedTotp(user) {
    return Array.isArray(user?.amr) && user.amr.some(method => method?.method === 'totp');
}

function createPrivilegedMfaMiddleware(getSessionFactorId = ({ sessionId, userId }) =>
    db.getSessionFactorId(sessionId, userId)) {
    return async function requirePrivilegedMfa(req, res, next) {
        if (!['admin', 'chair', 'viewer'].includes(req.workspaceRole)) {
            return res.status(403).json({ error: 'Workspace access required' });
        }
        const privileged = ['admin', 'chair'].includes(req.workspaceRole) || req.supportAccess;
        if (!privileged) return next();

        const approvedFactorId = req.authUser?.app_metadata?.confqual_approved_totp_factor_id;
        if (req.user?.aal !== 'aal2' || !hasVerifiedTotp(req.user) ||
            typeof approvedFactorId !== 'string' || !approvedFactorId) {
            return res.status(403).json({ error: 'Multi-factor authentication required', code: 'mfa_required' });
        }

        try {
            const sessionFactorId = await getSessionFactorId({ sessionId: req.user.session_id, userId: req.user.sub });
            if (sessionFactorId !== approvedFactorId) {
                return res.status(403).json({ error: 'Multi-factor authentication required', code: 'mfa_required' });
            }
            return next();
        } catch (error) {
            return next(error);
        }
    };
}

function requireTrustedSetup(req, res, next) {
    if (req.authUser?.app_metadata?.confqual_access_approved !== true) {
        return res.status(403).json({
            error: 'Workspace access is waiting for operator approval',
            code: 'access_pending'
        });
    }
    next();
}

module.exports = {
    createAuthMiddleware,
    getRole,
    hasVerifiedTotp,
    requireAuth,
    requireRole,
    createPrivilegedMfaMiddleware,
    requireTrustedSetup
};
