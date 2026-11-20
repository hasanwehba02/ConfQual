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
        aal: req.user.aal || 'aal1',
        totpVerified: Array.isArray(req.user.amr) && req.user.amr.some(method => method?.method === 'totp'),
        trustedSetupApproved: req.authUser?.app_metadata?.confqual_access_approved === true,
        mfaSetupAuthorized: req.authUser?.app_metadata?.confqual_mfa_setup_authorized === true,
        approvedTotpFactorId: req.authUser?.app_metadata?.confqual_approved_totp_factor_id || null
    });
}

module.exports = { getConfig, getCurrentUser };
