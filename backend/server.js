// server.js - Wert.io Backend for Railway Deployment
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

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
app.use(express.json({ limit: '10mb' }));

// CORS Configuration - Allow your frontend domains
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'http://localhost:3001', 
        'http://localhost:8080',
        'https://your-netlify-site.netlify.app', // Replace with your Netlify URL
        /\.netlify\.app$/,
        /\.vercel\.app$/,
        /\.railway\.app$/
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Rate Limiting
const createSessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: {
        error: 'Too many session creation requests, please try again later.'
    }
});

// Health Check Endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Wert.io Bitcoin Backend Server',
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
    });
});

// Health Check for Railway
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Create Session Endpoint
app.post('/api/create-session', createSessionLimiter, async (req, res) => {
    try {
        console.log('🚀 Creating Wert session with data:', req.body);
        
        // Extract and validate request data
        const { currency_amount, phone, email } = req.body;
        
        // Validate required fields
        if (!currency_amount || currency_amount < 25) {
            return res.status(400).json({
                success: false,
                error: 'Currency amount is required and must be at least $25'
            });
        }
        
        if (currency_amount > 10000) {
            return res.status(400).json({
                success: false,
                error: 'Maximum currency amount is $10,000'
            });
        }

        // Prepare session data for Wert API
        const sessionData = {
            flow_type: 'simple_full_restrict',
            currency: 'USD',
            currency_amount: parseFloat(currency_amount),
            commodity: 'BTC',
            network: 'bitcoin',
            wallet_address: WERT_CONFIG.WALLET_ADDRESS
        };

        // Add optional fields if provided
        if (phone) {
            sessionData.phone = phone;
        }

        console.log('📡 Sending session data to Wert:', sessionData);

        // Make request to Wert.io API
        const wertResponse = await fetch(WERT_CONFIG.WERT_API_URL, {
            method: 'POST',
            headers: {
                'X-Api-Key': WERT_CONFIG.API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Wert-Bitcoin-Backend/1.0.0'
            },
            body: JSON.stringify(sessionData)
        });

        console.log('📈 Wert API response status:', wertResponse.status);

        // Handle non-200 responses
        if (!wertResponse.ok) {
            let errorMessage = 'Failed to create session with Wert';
            let errorDetails = null;
            
            try {
                const errorData = await wertResponse.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
                errorDetails = errorData;
                console.error('❌ Wert API error:', errorData);
            } catch (parseError) {
                const errorText = await wertResponse.text();
                console.error('❌ Wert API raw error:', errorText);
                
                switch (wertResponse.status) {
                    case 400:
                        errorMessage = 'Invalid request data sent to Wert';
                        break;
                    case 401:
                        errorMessage = 'Unauthorized - invalid API key';
                        break;
                    case 429:
                        errorMessage = 'Rate limit exceeded - please try again later';
                        break;
                    case 500:
                        errorMessage = 'Wert server error - please try again';
                        break;
                    default:
                        errorMessage = `Wert API error (${wertResponse.status})`;
                }
            }
            
            return res.status(wertResponse.status).json({
                success: false,
                error: errorMessage,
                details: errorDetails,
                wertStatus: wertResponse.status
            });
        }

        // Parse successful response
        const wertData = await wertResponse.json();
        console.log('✅ Wert session created successfully:', {
            sessionId: wertData.sessionId ? 'present' : 'missing',
            dataKeys: Object.keys(wertData)
        });

        // Validate response has required fields
        if (!wertData.sessionId) {
            console.error('❌ Invalid Wert response - missing sessionId:', wertData);
            return res.status(500).json({
                success: false,
                error: 'Invalid response from Wert - missing session ID'
            });
        }

        // Return success response
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
        
        // Handle different types of errors
        let statusCode = 500;
        let errorMessage = 'Internal server error while creating session';
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Unable to connect to Wert API';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Request to Wert API timed out';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Wert.io Bitcoin Backend Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'production'}
🔑 API Key configured: ${WERT_CONFIG.API_KEY ? '✅ Yes' : '❌ No'}
👤 Partner ID: ${WERT_CONFIG.PARTNER_ID}
💼 Wallet: ${WERT_CONFIG.WALLET_ADDRESS}
🔗 Wert API: ${WERT_CONFIG.WERT_API_URL}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to create Bitcoin purchase sessions! 🎯
    `);
    
    // Log environment check
    if (!process.env.WERT_API_KEY) {
        console.warn('⚠️  WARNING: WERT_API_KEY not found in environment variables');
        console.warn('   Using hardcoded API key for demo purposes');
    }
    
    if (!process.env.WERT_PARTNER_ID) {
        console.warn('⚠️  WARNING: WERT_PARTNER_ID not found in environment variables');
        console.warn('   Using hardcoded Partner ID for demo purposes');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
