/**
 * IntoAEC Analytics Dashboard - Express Server
 * Serves the dashboard HTML and exposes /api/data + /api/refresh
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAnalytics } from './analysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// GET /api/data
// Fetches fresh analytics data on demand and returns it directly.
app.get('/api/data', async (req, res) => {
    try {
        const payload = await runAnalytics();
        return res.json(payload);
    } catch (err) {
        console.error('Data fetch failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/refresh
// Fetches fresh analytics data and returns it without storing it.
app.post('/api/refresh', async (req, res) => {
    console.log('\nRefreshing dashboard live data...');
    try {
        const payload = await runAnalytics();
        console.log('Refresh complete.');
        return res.json(payload);
    } catch (err) {
        console.error('Refresh failed:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`\nIntoAEC Dashboard running at http://localhost:${port}`);
        console.log('Open the URL above in your browser.');
        console.log('Click "Refresh Live Data" to pull real social + GA4 + YouTube data.\n');
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 3010) {
            console.warn(`Port ${port} is busy, trying ${port + 1}...`);
            startServer(port + 1);
            return;
        }

        console.error(
            err.code === 'EADDRINUSE'
                ? `No free port found between ${DEFAULT_PORT} and 3010.`
                : `Server failed to start: ${err.message}`
        );
        process.exitCode = 1;
    });
}

startServer(DEFAULT_PORT);
