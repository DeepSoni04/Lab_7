/**
 * server.js — CampusConnect Cloud API Gateway
 * Web Services & SOA Laboratory • Lab 7
 *
 * Responsibilities:
 * - Single Entry Point for all client requests (Port 8080)
 * - Configuration-Based Service Discovery (serviceRegistry.js)
 * - Reverse Proxy Routing (/users, /products, /orders)
 * - Cross-Cutting Concerns: Structured Request Logging & Centralized 502/503 Error Handling
 * - Pure Routing Layer: Contains ZERO business logic
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const serviceRegistry = require('./config/serviceRegistry');

const app = express();
const PORT = process.env.GATEWAY_PORT || process.env.PORT || 8080;
const startTime = new Date();

/* ——— Cross-Cutting Concern: CORS ——————————————————————————— */
app.use(cors());

/* ——— Cross-Cutting Concern: Request Logging Middleware ————— */
app.use((req, res, next) => {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[API-GATEWAY] [${timestamp}] ${req.method} ${req.originalUrl} -> Status: ${res.statusCode} (${duration}ms)`);
    });
    next();
});

/* ——— Gateway Direct Endpoints (No Proxying) ————————————————— */

/**
 * Health Check Endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
    const uptimeSec = Math.floor((new Date() - startTime) / 1000);
    res.status(200).json({
        status: 'UP',
        service: 'api-gateway',
        version: '2.0.0',
        port: PORT,
        uptimeSeconds: uptimeSec,
        registeredServices: serviceRegistry.getRoutingTable(),
        timestamp: new Date().toISOString()
    });
});

/**
 * Service Discovery Registry Inspection Endpoint
 * GET /routes or GET /registry
 */
app.get(['/routes', '/registry'], (req, res) => {
    res.status(200).json({
        success: true,
        discoveryType: 'Configuration-Based (Static Registry with Environment Overrides)',
        routingTable: serviceRegistry.getRoutingTable(),
        timestamp: new Date().toISOString()
    });
});

/**
 * Service Discovery Dynamic Reconfiguration Endpoint (Proof of Config-Driven Routing)
 * PUT /registry/:serviceKey
 */
app.put('/registry/:serviceKey', express.json(), (req, res) => {
    const { serviceKey } = req.params;
    const { newUrl } = req.body;

    if (!newUrl || typeof newUrl !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Invalid Request',
            message: 'newUrl is required and must be a valid URL string.'
        });
    }

    try {
        const updated = serviceRegistry.updateServiceUrl(serviceKey, newUrl);
        return res.status(200).json({
            success: true,
            message: `Service '${serviceKey}' route updated successfully in configuration.`,
            service: updated
        });
    } catch (err) {
        return res.status(404).json({
            success: false,
            error: 'Not Found',
            message: err.message
        });
    }
});

/**
 * Gateway Discovery Landing
 * GET /
 */
app.get('/', (req, res) => {
    res.status(200).json({
        name: 'CampusConnect API Gateway',
        lab: 'Lab 7 — API Gateway, Service Discovery & Cloud Deployment',
        course: 'Web Services & Service-Oriented Architecture',
        status: 'ONLINE',
        entryPoint: `http://localhost:${PORT}`,
        routes: {
            users: '/users (Routed to User Service)',
            products: '/products (Routed to Product Service)',
            orders: '/orders (Routed to Order Service)',
            health: '/health',
            registry: '/routes'
        }
    });
});

/* ——— Centralized Proxy Route Generator with 502/503 Error Handling — */
function createServiceProxy(serviceKey) {
    return createProxyMiddleware({
        router: () => {
            const service = serviceRegistry.getService(serviceKey);
            return service ? service.url : 'http://localhost:3000';
        },
        changeOrigin: true,
        proxyTimeout: 5000,
        timeout: 5000,
        pathRewrite: (path, req) => req.originalUrl, // Preserves full path (/users, /products, /orders)
        onError: (err, req, res) => {
            const service = serviceRegistry.getService(serviceKey);
            const targetUrl = service ? `${service.url}${req.originalUrl}` : req.originalUrl;
            console.error(`[API-GATEWAY] Centralized Error: ${service?.name || serviceKey} unreachable at ${targetUrl} (${err.code || err.message})`);

            // Return clean 502 Bad Gateway / 503 Service Unavailable structured JSON response
            res.status(502).json({
                success: false,
                error: 'Bad Gateway / Service Unavailable',
                gateway: 'api-gateway',
                targetService: service?.name || serviceKey,
                targetUrl: targetUrl,
                statusCode: 502,
                errorCode: err.code || 'UPSTREAM_ERROR',
                message: `The upstream microservice '${service?.name || serviceKey}' is currently unreachable or timed out. Please check service health.`,
                timestamp: new Date().toISOString()
            });
        }
    });
}

// Attach reverse-proxy middleware routes
app.use('/users', createServiceProxy('userService'));
app.use('/products', createServiceProxy('productService'));
app.use('/orders', createServiceProxy('orderService'));

/* ——— Fallback 404 for Unmatched Routes ——————————————————————— */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route Not Found',
        gateway: 'api-gateway',
        path: req.originalUrl,
        message: `Endpoint '${req.method} ${req.originalUrl}' does not match any registered microservice route.`
    });
});

/* ——— Server Startup ————————————————————————————————————————— */
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================================`);
    console.log(`  CampusConnect API Gateway running on port ${PORT}`);
    console.log(`  Public Gateway Entry Point: http://localhost:${PORT}`);
    console.log(`  Gateway Health:             http://localhost:${PORT}/health`);
    console.log(`  Service Discovery Routes:   http://localhost:${PORT}/routes`);
    console.log(`=================================================================`);
});

module.exports = { app, server };
