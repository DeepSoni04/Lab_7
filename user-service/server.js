/**
 * server.js — CampusConnect User Microservice
 * Web Services & SOA Laboratory • Lab 6 • Microservices
 *
 * Responsibility: Create, retrieve, update, and delete User resources.
 * Port: 3001 (Configurable via USER_SERVICE_PORT or PORT)
 * Data Ownership: Independent User DB (user_db)
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const User     = require('./models/User');

const app  = express();
const PORT = process.env.USER_SERVICE_PORT || process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/user_db';

/* ——— Middleware ————————————————————————————————————————————— */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Request logger for microservice audit trail
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[user-service] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
});

/* ——— Seed Data & In-Memory Fallback Store ——————————————————— */
const initialSeedUsers = [
    {
        customId: '101',
        name: 'Aarav Patel',
        email: 'aarav.patel@campusconnect.edu',
        role: 'student',
        department: 'MSc IT',
        phone: '+91-9876543210',
        status: 'active'
    },
    {
        customId: '102',
        name: 'Priya Sharma',
        email: 'priya.sharma@campusconnect.edu',
        role: 'student',
        department: 'Information Technology',
        phone: '+91-9876543211',
        status: 'active'
    },
    {
        customId: '103',
        name: 'Dr. Vikram Seth',
        email: 'vikram.seth@campusconnect.edu',
        role: 'faculty',
        department: 'Computer Science',
        phone: '+91-9876543212',
        status: 'active'
    }
];

let inMemoryUsers = initialSeedUsers.map(u => ({ ...u, id: u.customId, createdAt: new Date() }));
let isDbConnected = false;

/* ——— Database Connection ———————————————————————————————————— */
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
})
.then(async () => {
    isDbConnected = true;
    console.log(`[user-service] Successfully connected to MongoDB at ${mongoose.connection.host}/${mongoose.connection.name}`);

    // Seed database if empty
    const count = await User.countDocuments();
    if (count === 0) {
        await User.insertMany(initialSeedUsers);
        console.log(`[user-service] Seeded ${initialSeedUsers.length} initial users into user_db.`);
    }
})
.catch((err) => {
    isDbConnected = false;
    console.warn(`[user-service] MongoDB connection notice: ${err.message}`);
    console.warn(`[user-service] Running in resilient adaptive mode with seed users available.`);
});

mongoose.connection.on('connected', () => { isDbConnected = true; });
mongoose.connection.on('disconnected', () => { isDbConnected = false; });

/* ——— Helper: Find User By ID (MongoDB ObjectId or customId) —— */
async function findUserById(id) {
    if (isDbConnected) {
        let user = null;
        if (mongoose.isValidObjectId(id)) {
            user = await User.findById(id);
        }
        if (!user) {
            user = await User.findOne({ customId: id });
        }
        return user;
    } else {
        return inMemoryUsers.find(u => u.id === id || u.customId === id || (u._id && u._id.toString() === id)) || null;
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
        service: 'user-service',
        port: PORT,
        database: isDbConnected ? 'MongoDB (connected)' : 'In-Memory (adaptive mode)',
        timestamp: new Date().toISOString()
    });
});

/**
 * List all users
 * GET /users
 */
app.get('/users', async (req, res) => {
    try {
        if (isDbConnected) {
            const users = await User.find().sort({ createdAt: -1 });
            return res.status(200).json({
                success: true,
                count: users.length,
                data: users
            });
        } else {
            return res.status(200).json({
                success: true,
                count: inMemoryUsers.length,
                data: inMemoryUsers
            });
        }
    } catch (err) {
        console.error('[user-service] Error fetching users:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve users',
            message: err.message
        });
    }
});

/**
 * Get single user by ID
 * GET /users/:id
 */
app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await findUserById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: `User with ID '${id}' not found`,
                service: 'user-service'
            });
        }
        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        console.error(`[user-service] Error fetching user ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error while fetching user',
            message: err.message
        });
    }
});

/**
 * Create a new user
 * POST /users
 */
app.post('/users', async (req, res) => {
    const { name, email, role, department, phone, status, customId } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'name is required and must be a non-empty string.'
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: 'email is required and must be a valid email address.'
        });
    }

    try {
        if (isDbConnected) {
            // Check for duplicate email
            const existingEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingEmail) {
                return res.status(409).json({
                    success: false,
                    error: 'Conflict',
                    message: `User with email '${email}' already exists.`
                });
            }

            const newUser = new User({
                customId: customId || (Date.now() % 100000).toString(),
                name: name.trim(),
                email: email.toLowerCase().trim(),
                role: role || 'student',
                department: department || 'Information Technology',
                phone: phone || '',
                status: status || 'active'
            });

            const savedUser = await newUser.save();
            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                data: savedUser
            });
        } else {
            const existing = inMemoryUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (existing) {
                return res.status(409).json({
                    success: false,
                    error: 'Conflict',
                    message: `User with email '${email}' already exists.`
                });
            }

            const generatedId = customId || (100 + inMemoryUsers.length + 1).toString();
            const newUser = {
                id: generatedId,
                customId: generatedId,
                name: name.trim(),
                email: email.toLowerCase().trim(),
                role: role || 'student',
                department: department || 'Information Technology',
                phone: phone || '',
                status: status || 'active',
                createdAt: new Date()
            };
            inMemoryUsers.push(newUser);

            return res.status(201).json({
                success: true,
                message: 'User created successfully (in-memory)',
                data: newUser
            });
        }
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'Conflict',
                message: 'User with provided email or ID already exists.'
            });
        }
        console.error('[user-service] Error creating user:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to create user',
            message: err.message
        });
    }
});

/**
 * Update an existing user
 * PUT /users/:id
 */
app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, role, department, phone, status } = req.body;

    try {
        if (isDbConnected) {
            let user = await findUserById(id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: `User with ID '${id}' not found`
                });
            }

            if (name !== undefined) user.name = name.trim();
            if (email !== undefined) user.email = email.toLowerCase().trim();
            if (role !== undefined) user.role = role;
            if (department !== undefined) user.department = department;
            if (phone !== undefined) user.phone = phone;
            if (status !== undefined) user.status = status;

            const updatedUser = await user.save();
            return res.status(200).json({
                success: true,
                message: 'User updated successfully',
                data: updatedUser
            });
        } else {
            const index = inMemoryUsers.findIndex(u => u.id === id || u.customId === id);
            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: `User with ID '${id}' not found`
                });
            }

            inMemoryUsers[index] = {
                ...inMemoryUsers[index],
                ...(name !== undefined && { name: name.trim() }),
                ...(email !== undefined && { email: email.toLowerCase().trim() }),
                ...(role !== undefined && { role }),
                ...(department !== undefined && { department }),
                ...(phone !== undefined && { phone }),
                ...(status !== undefined && { status }),
                updatedAt: new Date()
            };

            return res.status(200).json({
                success: true,
                message: 'User updated successfully (in-memory)',
                data: inMemoryUsers[index]
            });
        }
    } catch (err) {
        console.error(`[user-service] Error updating user ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Failed to update user',
            message: err.message
        });
    }
});

/**
 * Delete a user
 * DELETE /users/:id
 */
app.delete('/users/:id', async (req, res) => {
    const { id } = req.params;

    try {
        if (isDbConnected) {
            let result = null;
            if (mongoose.isValidObjectId(id)) {
                result = await User.findByIdAndDelete(id);
            }
            if (!result) {
                result = await User.findOneAndDelete({ customId: id });
            }

            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: `User with ID '${id}' not found`
                });
            }

            return res.status(200).json({
                success: true,
                message: `User with ID '${id}' deleted successfully`,
                data: result
            });
        } else {
            const index = inMemoryUsers.findIndex(u => u.id === id || u.customId === id);
            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error: `User with ID '${id}' not found`
                });
            }

            const deleted = inMemoryUsers.splice(index, 1)[0];
            return res.status(200).json({
                success: true,
                message: `User with ID '${id}' deleted successfully (in-memory)`,
                data: deleted
            });
        }
    } catch (err) {
        console.error(`[user-service] Error deleting user ${id}:`, err);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete user',
            message: err.message
        });
    }
});

/* ——— 404 Handler for Unmatched Routes ——————————————————————— */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.originalUrl} not found on User Service`,
        service: 'user-service'
    });
});

/* ——— Server Startup ————————————————————————————————————————— */
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  CampusConnect User Service running on port ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/health`);
    console.log(`  Users API:    http://localhost:${PORT}/users`);
    console.log(`=======================================================`);
});

module.exports = { app, server };
