const express = require('express');
const cors = require('cors');
const https = require('https');

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

// Helper function to make HTTPS requests
function makeHttpsRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        statusCode: res.statusCode,
                        data: jsonData,
                        headers: res.headers
                    });
                } catch (parseError) {
                    console.error('❌ JSON parse error:', parseError);
                    resolve({
                        statusCode: res.statusCode,
                        data: { error: 'Invalid JSON response', raw: data },
                        headers: res.headers
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ HTTPS request error:', error);
            reject(error);
        });

        req.on('timeout', () => {
            console.error('❌ HTTPS request timeout');
            req.destroy();
            reject(new Error('Request timeout'));
        });

        // Set timeout
        req.setTimeout(30000); // 30 seconds

        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

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

        if (currency_amount > 10000) {
            console.log('❌ Amount too high:', currency_amount);
            return res.status(400).json({
                success: false,
                error: 'Maximum purchase amount is $10,000'
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

        const postData = JSON.stringify(sessionData);
        
        const options = {
            hostname: 'partner.wert.io',
            port: 443,
            path: '/api/external/hpp/create-session',
            method: 'POST',
            headers: {
                'X-Api-Key': WERT_CONFIG.API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Accept': 'application/json',
                'User-Agent': 'Wert-Bitcoin-Backend/1.0.0'
            }
        };

        console.log('🔑 Using API Key:', WERT_CONFIG.API_KEY ? 'Present' : 'Missing');
        
        const response = await makeHttpsRequest(options, postData);
        
        console.log('📈 Wert API response status:', response.statusCode);
        console.log('📄 Wert API response:', response.data);

        if (response.statusCode !== 200) {
            const errorMessage = response.data.message || response.data.error || 'Failed to create session';
            console.error('❌ Wert API error:', response.data);
            
            return res.status(response.statusCode).json({
                success: false,
                error: errorMessage,
                details: response.data
            });
        }

        const wertData = response.data;

        if (!wertData.sessionId) {
            console.error('❌ No session ID in response:', wertData);
            return res.status(500).json({
                success: false,
                error: 'No session ID returned from Wert',
                response: wertData
            });
        }

        console.log('✅ Wert session created successfully:', wertData.sessionId);

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
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Test endpoint to verify Wert API connectivity
app.get('/api/test-wert', async (req, res) => {
    try {
        const testData = {
            flow_type: 'simple_full_restrict',
            currency: 'USD',
            currency_amount: 50,
            commodity: 'BTC',
            network: 'bitcoin',
            wallet_address: WERT_CONFIG.WALLET_ADDRESS
        };

        const postData = JSON.stringify(testData);
        
        const options = {
            hostname: 'partner.wert.io',
            port: 443,
            path: '/api/external/hpp/create-session',
            method: 'POST',
            headers: {
                'X-Api-Key': WERT_CONFIG.API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Accept': 'application/json',
                'User-Agent': 'Wert-Bitcoin-Backend/1.0.0'
            }
        };

        const response = await makeHttpsRequest(options, postData);
        
        res.json({
            success: response.statusCode === 200,
            statusCode: response.statusCode,
            response: response.data,
            config: {
                apiKeyPresent: !!WERT_CONFIG.API_KEY,
                partnerId: WERT_CONFIG.PARTNER_ID,
                walletAddress: WERT_CONFIG.WALLET_ADDRESS
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
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
            'GET /api/test-wert',
            'POST /api/create-session'
        ]
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Wert.io Bitcoin Backend Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server: http://0.0.0.0:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'production'}
🔑 API Key: ${WERT_CONFIG.API_KEY ? '✅ Configured' : '❌ Missing'}
👤 Partner ID: ${WERT_CONFIG.PARTNER_ID}
💼 Wallet: ${WERT_CONFIG.WALLET_ADDRESS}
🔗 Wert API: ${WERT_CONFIG.WERT_API_URL}
🛡️  CORS: Enabled for all Netlify domains
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready for Bitcoin purchases! 🎯

Test the API: GET ${process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`}/api/test-wert
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
