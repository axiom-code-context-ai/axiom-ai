const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API endpoint for analysis
app.post('/api/analyze', async (req, res) => {
    try {
        const { gitUrl } = req.body;
        
        if (!gitUrl) {
            return res.status(400).json({ error: 'Git URL is required' });
        }

        console.log('Analyzing repository:', gitUrl);

        // Mock analysis - simulates the real workflow:
        // 1. Clone repository
        // 2. Run TreeSitter AST analysis
        // 3. Generate RepoMix-style context
        // 4. Store in database
        
        // Simulate analysis delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        const result = {
            repository: gitUrl,
            filesAnalyzed: Math.floor(Math.random() * 100) + 50,
            contextGenerated: true,
            status: 'success',
            timestamp: new Date().toISOString()
        };

        res.json(result);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Analysis failed' });
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
