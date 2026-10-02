const { createClient } = require('@supabase/supabase-js');

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

function createAuthMiddleware(getClaims) {
    return async function requireAuth(req, res, next) {
        const header = req.get('authorization');
        const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        try {
            const { data, error } = await getClaims(token);
            const claims = data?.claims;

            if (error || !claims?.sub) {
                return res.status(401).json({ error: 'Invalid or expired session' });
            }

            req.user = claims;
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

    return createAuthMiddleware((token) => client.auth.getClaims(token))(req, res, next);
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

module.exports = {
    createAuthMiddleware,
    getRole,
    requireAuth,
    requireRole
};
