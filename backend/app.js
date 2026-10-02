const express = require('express');
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

    app.use(express.json());
    app.get('/vendor/supabase.js', (req, res) => {
        const supabaseEntry = require.resolve('@supabase/supabase-js');
        res.sendFile(path.join(path.dirname(supabaseEntry), 'umd', 'supabase.js'));
    });
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/api/auth/config', authRoutes.getConfig);
    app.get('/api/auth/me', authMiddleware, authRoutes.getCurrentUser);
    app.use('/api/analytics', authMiddleware, workspaceMiddleware, analyticsRoutes);
    app.use('/api/settings', authMiddleware, workspaceMiddleware, settingsRoutes);

    const { errorHandler } = require('./middleware/errorHandler');
    app.use(errorHandler);

    return app;
}

const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
