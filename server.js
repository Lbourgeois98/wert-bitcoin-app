const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Wert.io Configuration
const WERT_CONFIG = {
    API_KEY: process.env.WERT_API_KEY || '776572742d70726f642d33343733656162352d653566312d343363352d626535312d616531336165643361643539',
    PARTNER_ID: process.env.WERT_PARTNER_ID || '01K1T8VJJ8TY67M49FDXY865GF',
    WALLET_ADDRESS: process.env.WALLET_ADDRESS || '39zC2iwMf6qzmVVEcBdfXG6WpVn84Mwxzv',
    WERT_API_URL: 'https://partner.wert.io/api/external/hpp/create-session'
};

// Middleware
app.use(express.json());
app.use(cors({
    origin: true, // Allow all origins for now
    credentials: true
}));

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Wert.io Bitcoin Backend Server',
        status: 'running'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Create Session Endpoint
app.post('/api/create-session', async (req, res) => {
    try {
        const { currency_amount } = req.body;
        
        // Validate amount
        if (!currency_amount || currency_amount < 25) {
            return res.status(400).json({
                success: false,
                error: 'Currency amount is required and must be at least $25'
            });
        }

        // Session data
        const sessionData = {
            flow_type: 'simple_full_restrict',
            currency: 'USD',
            currency_amount: parseFloat(currency_amount),
            commodity: 'BTC',
            network: 'bitcoin',
            wallet_address: WERT_CONFIG.WALLET_ADDRESS
        };

        console.log('Creating session with:', sessionData);

        // Call Wert API
        const response = await fetch(WERT_CONFIG.WERT_API_URL, {
            method: 'POST',
            headers: {
                'X-Api-Key': WERT_CONFIG.API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sessionData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Wert API error:', errorText);
            return res.status(response.status).json({
                success: false,
                error: 'Failed to create session'
            });
        }

        const wertData = await response.json();
        
        if (!wertData.sessionId) {
            return res.status(500).json({
                success: false,
                error: 'No session ID returned'
            });
        }

        res.json({
            success: true,
            sessionId: wertData.sessionId,
            partnerId: WERT_CONFIG.PARTNER_ID,
            walletAddress: WERT_CONFIG.WALLET_ADDRESS
        });

    } catch (error) {
        console.error('Session creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
