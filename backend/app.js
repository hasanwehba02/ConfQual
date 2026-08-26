const express = require('express');
const path = require('path');
const analyticsRoutes = require('./routes/analyticsRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Central error handler (must be last)
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
