require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Backend listening at http://localhost:${PORT}`);

        // Pre-warm the sentiment ML model in the background.
        // Eliminates the 30-60s cold-start penalty on the first Excel upload.
        // If it fails, reviewImporter falls back to the rule-based analyzer automatically.
        const { getClassifier, isModelDisabled } = require('./utils/sentimentEngine');
        if (isModelDisabled()) {
            console.log('Using rule-based sentiment analysis.');
        } else {
            getClassifier()
                .then(() => console.log('Sentiment model ready.'))
                .catch(err => console.warn('Sentiment model pre-warm failed (fallback will be used):', err.message));
        }
    });
}

module.exports = { app };
