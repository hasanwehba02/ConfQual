const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const authRoutes = require('./routes/authRoutes');
const supportRoutes = require('./routes/supportRoutes');
const { requireAuth, createPrivilegedMfaMiddleware, requireTrustedSetup } = require('./middleware/auth');
const { requireWorkspace } = require('./middleware/workspace');
const { createSupportWorkspaceMiddleware } = require('./middleware/supportWorkspace');

function createApp({
    authMiddleware = requireAuth,
    workspaceMiddleware = requireWorkspace,
    privilegedMfaMiddleware = createPrivilegedMfaMiddleware()
} = {}) {
    const app = express();
    const supabaseOrigin = (() => {
        try {
            return new URL(process.env.SUPABASE_URL).origin;
        } catch {
            return null;
        }
    })();

    let trustProxy = false;
    if (process.env.DYNO) trustProxy = 1;
    else if (process.env.CONFQUAL_TRUST_PROXY === 'loopback') trustProxy = 'loopback';
    app.set('trust proxy', trustProxy);
    app.use(helmet({
        frameguard: { action: 'deny' },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                fontSrc: ["'self'", 'data:'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"]
            }
        }
    }));
    app.use('/api', rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 500,
        standardHeaders: 'draft-8',
        legacyHeaders: false
    }));
    app.use('/api', (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.use(express.json({ limit: '1mb' }));
    app.get('/vendor/supabase.js', (req, res) => {
        const supabaseEntry = require.resolve('@supabase/supabase-js');
        res.sendFile(path.join(path.dirname(supabaseEntry), 'umd', 'supabase.js'));
    });
    app.get('/vendor/chart.umd.js', (_req, res) => {
        res.sendFile(path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js'));
    });
    for (const weight of ['regular', 'fill']) {
        app.use(`/vendor/icons/${weight}`, express.static(path.dirname(require.resolve(`@phosphor-icons/web/${weight}`))));
    }
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/api/auth/config', authRoutes.getConfig);
    app.get('/api/auth/me', authMiddleware, workspaceMiddleware, authRoutes.getCurrentUser);
    app.use('/api/support', authMiddleware, workspaceMiddleware, requireTrustedSetup, privilegedMfaMiddleware, supportRoutes);
    const supportWorkspace = createSupportWorkspaceMiddleware(workspaceMiddleware);
    app.use('/api/analytics', authMiddleware, requireTrustedSetup, supportWorkspace('analytics:read'), privilegedMfaMiddleware, analyticsRoutes);
    app.use('/api/settings', authMiddleware, requireTrustedSetup, supportWorkspace('settings:read'), privilegedMfaMiddleware, settingsRoutes);

    app.use('/api', (_req, res) => {
        res.status(404).json({ error: 'API endpoint not found' });
    });
    app.use((_req, res) => {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    });

    const { errorHandler } = require('./middleware/errorHandler');
    app.use(errorHandler);

    return app;
}

const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
