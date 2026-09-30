/**
 * server.js — CampusConnect Product Microservice
 * Web Services & SOA Laboratory • Lab 6 • Microservices
 *
 * Responsibility: Manage Product resources used by the application.
 * Port: 3002 (Configurable via PRODUCT_SERVICE_PORT or PORT)
 * Data Ownership: Independent Product DB (product_db)
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const Product  = require('./models/Product');

const app  = express();
const PORT = process.env.PRODUCT_SERVICE_PORT || process.env.PORT || 3002;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/product_db';

/* ——— Middleware ————————————————————————————————————————————— */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Request logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[product-service] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
});

/* ——— Seed Data & In-Memory Fallback Store ——————————————————— */
const initialSeedProducts = [
    {
        customId: '501',
        name: 'Advanced Web Services & SOA Textbook',
        description: 'Comprehensive guide to SOA principles, RESTful microservices, and Docker orchestration.',
        price: 45.00,
        category: 'Books',
        stock: 30
    },
    {
        customId: '502',
        name: 'CampusConnect Smart ID Badge',
        description: 'NFC-enabled campus digital access identification badge with RFID encryption.',
        price: 15.00,
        category: 'Electronics',
        stock: 100
    },
    {
        customId: '503',
        name: 'IoT Development Sensor Kit',
        description: 'Embedded microcontroller, temperature/humidity sensors, and breadboard for laboratory practicals.',
        price: 75.50,
        category: 'Lab Equipment',
        stock: 15
    }
];

let inMemoryProducts = initialSeedProducts.map(p => ({ ...p, id: p.customId, createdAt: new Date() }));
let isDbConnected = false;

/* ——— Database Connection ———————————————————————————————————— */
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
})
.then(async () => {
    isDbConnected = true;
    console.log(`[product-service] Successfully connected to MongoDB at ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Seed database if empty
    const count = await Product.countDocuments();
    if (count === 0) {
        await Product.insertMany(initialSeedProducts);
        console.log(`[product-service] Seeded ${initialSeedProducts.length} initial products into product_db.`);
    }
})
.catch((err) => {
    isDbConnected = false;
    console.warn(`[product-service] MongoDB connection notice: ${err.message}`);
    console.warn(`[product-service] Running in resilient adaptive mode with seed products available.`);
});

mongoose.connection.on('connected', () => { isDbConnected = true; });
mongoose.connection.on('disconnected', () => { isDbConnected = false; });

/* ——— Helper: Find Product By ID (MongoDB ObjectId or customId) —— */
async function findProductById(id) {
    if (isDbConnected) {
        let product = null;
        if (mongoose.isValidObjectId(id)) {
            product = await Product.findById(id);
        }
        if (!product) {
            product = await Product.findOne({ customId: id });
        }
        return product;
    } else {
        return inMemoryProducts.find(p => p.id === id || p.customId === id || (p._id && p._id.toString() === id)) || null;
    }
}

/* ——— REST Endpoints ————————————————————————————————————————— */

/**
 * Health Check
 * GET /health
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        service: 'product-service',
        port: PORT,
        database: isDbConnected ? 'MongoDB (connected)' : 'In-Memory (adaptive mode)',
        timestamp: new Date().toISOString()
    });
});

/**
 * List all products
 * GET /products
 */
app.get('/products', async (req, res) => {
    try {
        const { category, minPrice, maxPrice } = req.query;

        if (isDbConnected) {
            const filter = {};
            if (category) filter.category = category;
            if (minPrice || maxPrice) {
                filter.price = {};
                if (minPrice) filter.price.$gte = Number(minPrice);
                if (maxPrice) filter.price.$lte = Number(maxPrice);
            }

            const products = await Product.find(filter).sort({ createdAt: -1 });
            return res.status(200).json({
                success: true,
                count: products.length,
                data: products
            });
        } else {
            let filtered = [...inMemoryProducts];
            if (category) filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
            if (minPrice) filtered = filtered.filter(p => p.price >= Number(minPrice));
            if (maxPrice) filtered = filtered.filter(p => p.price <= Number(maxPrice));

            return res.status(200).json({
                success: true,
                count: filtered.length,
                data: filtered
            });
        }
    } catch (err) {
        console.error('[product-service] Error fetching products:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve products',
            message: err.message
        });
    }
});

/**
 * Get product by ID
 * GET /products/:id
 */
app.get('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const product = await findProductById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: `Product with ID '${id}' not found`,
                service: 'product-service'
            });
        }
        return res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error(`[product-service] Error fetching product ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while fetching product',
            message: err.message
        });
    }
});

/**
 * Create new product
 * POST /products
 */
app.post('/products', async (req, res) => {
    const { name, description, price, category, stock, customId } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'name is required and must be a non-empty string.'
        });
    }

    if (price === undefined || typeof price !== 'number' || price < 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'price is required and must be a non-negative number.'
        });
    }

    try {
        if (isDbConnected) {
            const newProduct = new Product({
                customId: customId || (500 + Math.floor(Math.random() * 1000)).toString(),
                name: name.trim(),
                description: description || '',
                price: Number(price),
                category: category || 'General',
                stock: stock !== undefined ? Number(stock) : 20
            });

            const saved = await newProduct.save();
            return res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: saved
            });
        } else {
            const generatedId = customId || (500 + inMemoryProducts.length + 1).toString();
            const newProduct = {
                id: generatedId,
                customId: generatedId,
                name: name.trim(),
                description: description || '',
                price: Number(price),
                category: category || 'General',
                stock: stock !== undefined ? Number(stock) : 20,
                createdAt: new Date()
            };
            inMemoryProducts.push(newProduct);

            return res.status(201).json({
                success: true,
                message: 'Product created successfully (in-memory)',
                data: newProduct
            });
        }
    } catch (err) {
        console.error('[product-service] Error creating product:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to create product',
            message: err.message
        });
    }
});

/**
 * Update product by ID
 * PUT /products/:id
 */
app.put('/products/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, price, category, stock } = req.body;

    try {
        if (isDbConnected) {
            let product = await findProductById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: `Product with ID '${id}' not found`
                });
            }

            if (name !== undefined) product.name = name.trim();
            if (description !== undefined) product.description = description;
            if (price !== undefined) product.price = Number(price);
            if (category !== undefined) product.category = category;
            if (stock !== undefined) product.stock = Number(stock);

            const updated = await product.save();
            return res.status(200).json({
                success: true,
                message: 'Product updated successfully',
                data: updated
            });
        } else {
            const index = inMemoryProducts.findIndex(p => p.id === id || p.customId === id);
            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: `Product with ID '${id}' not found`
                });
            }

            inMemoryProducts[index] = {
                ...inMemoryProducts[index],
                ...(name !== undefined && { name: name.trim() }),
                ...(description !== undefined && { description }),
                ...(price !== undefined && { price: Number(price) }),
                ...(category !== undefined && { category }),
                ...(stock !== undefined && { stock: Number(stock) }),
                updatedAt: new Date()
            };

            return res.status(200).json({
                success: true,
                message: 'Product updated successfully (in-memory)',
                data: inMemoryProducts[index]
            });
        }
    } catch (err) {
        console.error(`[product-service] Error updating product ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Failed to update product',
            message: err.message
        });
    }
});

/**
 * Delete product by ID
 * DELETE /products/:id
 */
app.delete('/products/:id', async (req, res) => {
    const { id } = req.params;

    try {
        if (isDbConnected) {
            let result = null;
            if (mongoose.isValidObjectId(id)) {
                result = await Product.findByIdAndDelete(id);
            }
            if (!result) {
                result = await Product.findOneAndDelete({ customId: id });
            }

            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: `Product with ID '${id}' not found`
                });
            }

            return res.status(200).json({
                success: true,
                message: `Product with ID '${id}' deleted successfully`,
                data: result
            });
        } else {
            const index = inMemoryProducts.findIndex(p => p.id === id || p.customId === id);
            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: `Product with ID '${id}' not found`
                });
            }

            const deleted = inMemoryProducts.splice(index, 1)[0];
            return res.status(200).json({
                success: true,
                message: `Product with ID '${id}' deleted successfully (in-memory)`,
                data: deleted
            });
        }
    } catch (err) {
        console.error(`[product-service] Error deleting product ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete product',
            message: err.message
        });
    }
});

/* ——— 404 Handler for Unmatched Routes ——————————————————————— */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.originalUrl} not found on Product Service`,
        service: 'product-service'
    });
});

/* ——— Server Startup ————————————————————————————————————————— */
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  CampusConnect Product Service running on port ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/health`);
    console.log(`  Products API: http://localhost:${PORT}/products`);
    console.log(`=======================================================`);
});

module.exports = { app, server };
