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

// CORS Configuration - Updated to allow all Netlify domains
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Allow all localhost origins
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        
        // Allow all Netlify domains
        if (origin.includes('.netlify.app') || 
            origin.includes('.netlify.com') ||
            origin.includes('netlify.app')) {
            return callback(null, true);
        }
        
        // Allow Railway domains
        if (origin.includes('.railway.app')) {
            return callback(null, true);
        }
        
        // Allow Vercel domains (just in case)
        if (origin.includes('.vercel.app')) {
            return callback(null, true);
        }
        
        console.log('Origin not allowed by CORS:', origin);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
}));

// Add explicit preflight handler
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Wert.io Bitcoin Backend Server',
        status: 'running',
        cors: 'enabled',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Create Session Endpoint
app.post('/api/create-session', async (req, res) => {
    try {
        console.log('🚀 Session creation request from:', req.headers.origin);
        console.log('📦 Request body:', req.body);
        
        const { currency_amount } = req.body;
        
        // Validate amount
        if (!currency_amount || currency_amount < 25) {
            console.log('❌ Invalid amount:', currency_amount);
            return res.status(400).json({
                success: false,
                error: 'Currency amount is required and must be at least $25'
            });
        }

        // Session data for Wert API
        const sessionData = {
            flow_type: 'simple_full_restrict',
            currency: 'USD',
            currency_amount: parseFloat(currency_amount),
            commodity: 'BTC',
            network: 'bitcoin',
            wallet_address: WERT_CONFIG.WALLET_ADDRESS
        };

        console.log('📡 Calling Wert API with:', sessionData);

        // Call Wert API with fetch fallback for older Node.js
        let wertResponse;
        try {
            // Try native fetch first (Node 18+)
            wertResponse = await fetch(WERT_CONFIG.WERT_API_URL, {
                method: 'POST',
                headers: {
                    'X-Api-Key': WERT_CONFIG.API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Wert-Bitcoin-Backend/1.0.0'
                },
                body: JSON.stringify(sessionData)
            });
        } catch (fetchError) {
            // Fallback for older Node.js versions
            console.log('Native fetch failed, trying alternative...');
            const https = require('https');
            const querystring = require('querystring');
            
            return new Promise((resolve, reject) => {
                const postData = JSON.stringify(sessionData);
                const options = {
                    hostname: 'partner.wert.io',
                    port: 443,
                    path: '/api/external/hpp/create-session',
                    method: 'POST',
                    headers: {
                        'X-Api-Key': WERT_CONFIG.API_KEY,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (wertRes) => {
                    let data = '';
                    wertRes.on('data', (chunk) => { data += chunk; });
                    wertRes.on('end', () => {
                        try {
                            const wertData = JSON.parse(data);
                            if (wertRes.statusCode === 200 && wertData.sessionId) {
                                resolve(res.json({
                                    success: true,
                                    sessionId: wertData.sessionId,
                                    partnerId: WERT_CONFIG.PARTNER_ID,
                                    walletAddress: WERT_CONFIG.WALLET_ADDRESS
                                }));
                            } else {
                                resolve(res.status(wertRes.statusCode || 500).json({
                                    success: false,
                                    error: wertData.message || 'Wert API error'
                                }));
                            }
                        } catch (parseError) {
                            resolve(res.status(500).json({
                                success: false,
                                error: 'Invalid response from Wert API'
                            }));
                        }
                    });
                });

                req.on('error', (error) => {
                    resolve(res.status(500).json({
                        success: false,
                        error: 'Failed to connect to Wert API'
                    }));
                });

                req.write(postData);
                req.end();
            });
        }

        console.log('📈 Wert API response status:', wertResponse.status);

        if (!wertResponse.ok) {
            let errorMessage = 'Failed to create session';
            try {
                const errorData = await wertResponse.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
                console.error('❌ Wert API error:', errorData);
            } catch (e) {
                const errorText = await wertResponse.text();
                console.error('❌ Wert API raw error:', errorText);
            }
            
            return res.status(wertResponse.status).json({
                success: false,
                error: errorMessage
            });
        }

        const wertData = await wertResponse.json();
        console.log('✅ Wert session created successfully');

        if (!wertData.sessionId) {
            console.error('❌ No session ID in response:', wertData);
            return res.status(500).json({
                success: false,
                error: 'No session ID returned from Wert'
            });
        }

        // Success response
        res.json({
            success: true,
            sessionId: wertData.sessionId,
            partnerId: WERT_CONFIG.PARTNER_ID,
            walletAddress: WERT_CONFIG.WALLET_ADDRESS,
            amount: currency_amount,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Session creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /',
            'GET /health',
            'POST /api/create-session'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 Wert.io Bitcoin Backend Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://localhost:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'production'}
🔑 API Key: ${WERT_CONFIG.API_KEY ? '✅ Configured' : '❌ Missing'}
👤 Partner ID: ${WERT_CONFIG.PARTNER_ID}
💼 Wallet: ${WERT_CONFIG.WALLET_ADDRESS}
🔗 Wert API: ${WERT_CONFIG.WERT_API_URL}
🛡️  CORS: Enabled for all Netlify domains
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready for Bitcoin purchases! 🎯
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 Shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
