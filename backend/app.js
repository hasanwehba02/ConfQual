const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const authRoutes = require('./routes/authRoutes');
const { requireAuth } = require('./middleware/auth');
const { requireWorkspace } = require('./middleware/workspace');

function createApp({
    authMiddleware = requireAuth,
    workspaceMiddleware = requireWorkspace
} = {}) {
    const app = express();
    const supabaseOrigin = (() => {
        try {
            return new URL(process.env.SUPABASE_URL).origin;
        } catch {
            return null;
        }
    })();

    app.set('trust proxy', 1);
    app.use(helmet({
        frameguard: { action: 'deny' },
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
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
    app.use(express.json({ limit: '1mb' }));
    app.get('/vendor/supabase.js', (req, res) => {
        const supabaseEntry = require.resolve('@supabase/supabase-js');
        res.sendFile(path.join(path.dirname(supabaseEntry), 'umd', 'supabase.js'));
    });
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/api/auth/config', authRoutes.getConfig);
    app.get('/api/auth/me', authMiddleware, authRoutes.getCurrentUser);
    app.use('/api/analytics', authMiddleware, workspaceMiddleware, analyticsRoutes);
    app.use('/api/settings', authMiddleware, workspaceMiddleware, settingsRoutes);

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
