function getConfig(req, res) {
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !publishableKey) {
        return res.status(503).json({ error: 'Authentication is not configured' });
    }

    res.json({ url, publishableKey });
}

function getCurrentUser(req, res) {
    res.json({
        id: req.user.sub,
        email: req.user.email || null,
        role: req.workspaceRole,
        aal: req.user.aal || 'aal1'
    });
}

module.exports = { getConfig, getCurrentUser };
