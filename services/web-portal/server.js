const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API endpoint for analysis - calls REAL crawler-agent
app.post('/api/analyze', async (req, res) => {
    try {
        const { gitUrl } = req.body;
        
        if (!gitUrl) {
            return res.status(400).json({ error: 'Git URL is required' });
        }

        console.log('Triggering REAL repository analysis:', gitUrl);

        // Call the crawler-agent service for REAL analysis
        const crawlerUrl = process.env.CRAWLER_AGENT_URL || 'http://crawler-agent:4001';
        
        const response = await fetch(`${crawlerUrl}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ gitUrl })
        });

        if (!response.ok) {
            throw new Error(`Crawler agent failed: ${response.statusText}`);
        }

        const crawlerResult = await response.json();
        
        console.log('Analysis complete:', crawlerResult.filesProcessed, 'files');

        const result = {
            repository: gitUrl,
            filesAnalyzed: crawlerResult.filesProcessed || 0,
            contextGenerated: crawlerResult.contextGenerated || false,
            patterns: crawlerResult.patterns || [],
            codeStats: crawlerResult.codeStats || {},
            status: crawlerResult.status,
            timestamp: crawlerResult.timestamp
        };

        res.json(result);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ 
            error: 'Analysis failed',
            details: error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Axiom AI Web Portal',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Axiom AI Web Portal running on http://0.0.0.0:${PORT}`);
});
