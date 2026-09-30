/**
 * server.js — CampusConnect Order Microservice
 * Web Services & SOA Laboratory • Lab 6 • Microservices
 *
 * Responsibility: Create and retrieve Orders; validate referenced User and Product data through APIs.
 * Port: 3003 (Configurable via ORDER_SERVICE_PORT or PORT)
 * Data Ownership: Independent Order DB (order_db)
 *
 * Inter-Service Communication:
 * - Calls User Service:    GET ${USER_SERVICE_URL}/users/:userId
 * - Calls Product Service: GET ${PRODUCT_SERVICE_URL}/products/:productId
 *
 * Resilience & Error Handling:
 * - Timeout handling (default: 3000ms)
 * - Returns 404 if referenced user or product does not exist
 * - Returns 503 Service Unavailable if User or Product service is unreachable/down
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const axios    = require('axios');
const Order    = require('./models/Order');

const app  = express();
const PORT = process.env.ORDER_SERVICE_PORT || process.env.PORT || 3003;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/order_db';

const USER_SERVICE_URL    = (process.env.USER_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
const PRODUCT_SERVICE_URL = (process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002').replace(/\/$/, '');
const HTTP_TIMEOUT_MS     = parseInt(process.env.HTTP_TIMEOUT_MS || '3000', 10);

/* ——— Middleware ————————————————————————————————————————————— */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Request logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[order-service] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
});

/* ——— Seed Data & In-Memory Fallback Store ——————————————————— */
const initialSeedOrders = [
    {
        orderId: 'ORD-1001',
        userId: '101',
        productId: '501',
        quantity: 2,
        unitPrice: 45.00,
        totalAmount: 90.00,
        status: 'CONFIRMED',
        userSnapshot: {
            name: 'Aarav Patel',
            email: 'aarav.patel@campusconnect.edu',
            department: 'MSc IT'
        },
        productSnapshot: {
            name: 'Advanced Web Services & SOA Textbook',
            category: 'Books',
            price: 45.00
        }
    }
];

let inMemoryOrders = initialSeedOrders.map(o => ({ ...o, id: o.orderId, createdAt: new Date() }));
let isDbConnected = false;

/* ——— Database Connection ———————————————————————————————————— */
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
})
.then(async () => {
    isDbConnected = true;
    console.log(`[order-service] Successfully connected to MongoDB at ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Seed database if empty
    const count = await Order.countDocuments();
    if (count === 0) {
        await Order.insertMany(initialSeedOrders);
        console.log(`[order-service] Seeded ${initialSeedOrders.length} initial orders into order_db.`);
    }
})
.catch((err) => {
    isDbConnected = false;
    console.warn(`[order-service] MongoDB connection notice: ${err.message}`);
    console.warn(`[order-service] Running in resilient adaptive mode with seed orders available.`);
});

mongoose.connection.on('connected', () => { isDbConnected = true; });
mongoose.connection.on('disconnected', () => { isDbConnected = false; });

/* ——— Helper: Find Order By ID (MongoDB ObjectId or orderId) — */
async function findOrderById(id) {
    if (isDbConnected) {
        let order = null;
        if (mongoose.isValidObjectId(id)) {
            order = await Order.findById(id);
        }
        if (!order) {
            order = await Order.findOne({ orderId: id });
        }
        return order;
    } else {
        return inMemoryOrders.find(o => o.id === id || o.orderId === id || (o._id && o._id.toString() === id)) || null;
    }
}

/* ——— Inter-Service Communication Helpers with Error Handling — */

/**
 * Validate & Fetch User from User Service
 * Order Service -> GET http://user-service:3001/users/:id
 */
async function fetchUserFromService(userId) {
    const targetUrl = `${USER_SERVICE_URL}/users/${userId}`;
    console.log(`[order-service -> user-service] Fetching user verification: ${targetUrl}`);

    try {
        const response = await axios.get(targetUrl, {
            timeout: HTTP_TIMEOUT_MS,
            headers: { 'Accept': 'application/json' }
        });

        const userData = response.data?.data || response.data;
        return { success: true, user: userData };
    } catch (err) {
        if (err.response) {
            if (err.response.status === 404) {
                return {
                    success: false,
                    type: 'NOT_FOUND',
                    statusCode: 404,
                    dependency: 'User Service',
                    targetUrl,
                    message: `User with ID '${userId}' not found in User Service.`
                };
            }
            return {
                success: false,
                type: 'SERVICE_ERROR',
                statusCode: 503,
                dependency: 'User Service',
                targetUrl,
                message: `User Service returned error: ${err.response.statusText || err.response.status}`
            };
        }

        // Connection refused, DNS failure, or Timeout -> Controlled 503
        return {
            success: false,
            type: 'SERVICE_UNAVAILABLE',
            statusCode: 503,
            dependency: 'User Service',
            targetUrl,
            message: `User Service is currently unavailable at '${USER_SERVICE_URL}' (${err.code || err.message}).`
        };
    }
}

/**
 * Validate & Fetch Product from Product Service
 * Order Service -> GET http://product-service:3002/products/:id
 */
async function fetchProductFromService(productId) {
    const targetUrl = `${PRODUCT_SERVICE_URL}/products/${productId}`;
    console.log(`[order-service -> product-service] Fetching product verification: ${targetUrl}`);

    try {
        const response = await axios.get(targetUrl, {
            timeout: HTTP_TIMEOUT_MS,
            headers: { 'Accept': 'application/json' }
        });

        const productData = response.data?.data || response.data;
        return { success: true, product: productData };
    } catch (err) {
        if (err.response) {
            if (err.response.status === 404) {
                return {
                    success: false,
                    type: 'NOT_FOUND',
                    statusCode: 404,
                    dependency: 'Product Service',
                    targetUrl,
                    message: `Product with ID '${productId}' not found in Product Service.`
                };
            }
            return {
                success: false,
                type: 'SERVICE_ERROR',
                statusCode: 503,
                dependency: 'Product Service',
                targetUrl,
                message: `Product Service returned error: ${err.response.statusText || err.response.status}`
            };
        }

        // Connection refused, DNS failure, or Timeout -> Controlled 503
        return {
            success: false,
            type: 'SERVICE_UNAVAILABLE',
            statusCode: 503,
            dependency: 'Product Service',
            targetUrl,
            message: `Product Service is currently unavailable at '${PRODUCT_SERVICE_URL}' (${err.code || err.message}).`
        };
    }
}

/* ——— REST Endpoints ————————————————————————————————————————— */

/**
 * Health Check & Dependency Status
 * GET /health
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'order-service',
        port: PORT,
        database: isDbConnected ? 'MongoDB (connected)' : 'In-Memory (adaptive mode)',
        dependencies: {
            userServiceUrl: USER_SERVICE_URL,
            productServiceUrl: PRODUCT_SERVICE_URL,
            timeoutLimitMs: HTTP_TIMEOUT_MS
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * List all orders
 * GET /orders
 */
app.get('/orders', async (req, res) => {
    try {
        if (isDbConnected) {
            const orders = await Order.find().sort({ createdAt: -1 });
            return res.status(200).json({
                success: true,
                count: orders.length,
                data: orders
            });
        } else {
            return res.status(200).json({
                success: true,
                count: inMemoryOrders.length,
                data: inMemoryOrders
            });
        }
    } catch (err) {
        console.error('[order-service] Error fetching orders:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve orders',
            message: err.message
        });
    }
});

/**
 * Get order by ID
 * GET /orders/:id
 */
app.get('/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const order = await findOrderById(id);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: `Order with ID '${id}' not found`,
                service: 'order-service'
            });
        }
        return res.status(200).json({
            success: true,
            data: order
        });
    } catch (err) {
        console.error(`[order-service] Error fetching order ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while fetching order',
            message: err.message
        });
    }
});

/**
 * Create Order with Inter-Service Verification
 * POST /orders
 *
 * Flow:
 * 1. Validate payload
 * 2. Order Service -> GET User Service (/users/:userId)
 *    If user missing -> 404
 *    If user-service unreachable -> 503 Service Unavailable
 * 3. Order Service -> GET Product Service (/products/:productId)
 *    If product missing -> 404
 *    If product-service unreachable -> 503 Service Unavailable
 * 4. Verify inventory & compute total
 * 5. Persist order in order_db and return 201 Created
 */
app.post('/orders', async (req, res) => {
    const { userId, productId, quantity } = req.body;

    // 1. Basic validation
    if (!userId || String(userId).trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'userId is required to create an order.'
        });
    }

    if (!productId || String(productId).trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'productId is required to create an order.'
        });
    }

    const orderQty = Number(quantity);
    if (!orderQty || orderQty < 1 || !Number.isInteger(orderQty)) {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'quantity must be a positive integer greater than or equal to 1.'
        });
    }

    // 2. Inter-Service Call: Verify User with User Service
    const userResult = await fetchUserFromService(userId);
    if (!userResult.success) {
        // Controlled failure: 404 for invalid user ID, 503 when User Service is down
        return res.status(userResult.statusCode).json({
            success: false,
            error: userResult.statusCode === 503 ? 'Service Unavailable' : 'Resource Not Found',
            dependency: userResult.dependency,
            targetUrl: userResult.targetUrl,
            message: userResult.message,
            statusCode: userResult.statusCode
        });
    }

    const verifiedUser = userResult.user;

    // 3. Inter-Service Call: Verify Product with Product Service
    const productResult = await fetchProductFromService(productId);
    if (!productResult.success) {
        // Controlled failure: 404 for invalid product ID, 503 when Product Service is down
        return res.status(productResult.statusCode).json({
            success: false,
            error: productResult.statusCode === 503 ? 'Service Unavailable' : 'Resource Not Found',
            dependency: productResult.dependency,
            targetUrl: productResult.targetUrl,
            message: productResult.message,
            statusCode: productResult.statusCode
        });
    }

    const verifiedProduct = productResult.product;

    // Check stock
    if (verifiedProduct.stock !== undefined && verifiedProduct.stock < orderQty) {
        return res.status(400).json({
            success: false,
            error: 'Insufficient Stock',
            message: `Requested quantity (${orderQty}) exceeds available stock (${verifiedProduct.stock}).`
        });
    }

    // 4. Calculate total & construct Order document
    const unitPrice = Number(verifiedProduct.price || 0);
    const totalAmount = parseFloat((unitPrice * orderQty).toFixed(2));
    const generatedOrderId = `ORD-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 100)}`;

    const userSnapshot = {
        name: verifiedUser.name || 'Unknown',
        email: verifiedUser.email || 'N/A',
        department: verifiedUser.department || 'N/A'
    };

    const productSnapshot = {
        name: verifiedProduct.name || 'Unknown',
        category: verifiedProduct.category || 'General',
        price: unitPrice
    };

    try {
        if (isDbConnected) {
            const newOrder = new Order({
                orderId: generatedOrderId,
                userId: String(userId),
                productId: String(productId),
                quantity: orderQty,
                unitPrice,
                totalAmount,
                status: 'CONFIRMED',
                userSnapshot,
                productSnapshot
            });

            const savedOrder = await newOrder.save();
            return res.status(201).json({
                success: true,
                message: 'Order placed successfully after inter-service validation',
                data: savedOrder,
                verifiedDependencies: {
                    user: userSnapshot,
                    product: productSnapshot
                }
            });
        } else {
            const newOrder = {
                id: generatedOrderId,
                orderId: generatedOrderId,
                userId: String(userId),
                productId: String(productId),
                quantity: orderQty,
                unitPrice,
                totalAmount,
                status: 'CONFIRMED',
                userSnapshot,
                productSnapshot,
                createdAt: new Date()
            };
            inMemoryOrders.push(newOrder);

            return res.status(201).json({
                success: true,
                message: 'Order placed successfully (in-memory) after inter-service validation',
                data: newOrder,
                verifiedDependencies: {
                    user: userSnapshot,
                    product: productSnapshot
                }
            });
        }
    } catch (err) {
        console.error('[order-service] Error saving order:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to persist order',
            message: err.message
        });
    }
});

/* ——— 404 Handler for Unmatched Routes ——————————————————————— */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.originalUrl} not found on Order Service`,
        service: 'order-service'
    });
});

/* ——— Server Startup ————————————————————————————————————————— */
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  CampusConnect Order Service running on port ${PORT}`);
    console.log(`  Health Check:        http://localhost:${PORT}/health`);
    console.log(`  Orders API:          http://localhost:${PORT}/orders`);
    console.log(`  Target User Service:    ${USER_SERVICE_URL}`);
    console.log(`  Target Product Service: ${PRODUCT_SERVICE_URL}`);
    console.log(`=======================================================`);
});

module.exports = { app, server };
