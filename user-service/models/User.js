const mongoose = require('mongoose');

/**
 * User Data Model — CampusConnect Microservices Architecture
 * Web Services & SOA Laboratory • Lab 6
 *
 * Enforces schema constraints and unique index on email.
 * Supports both custom numeric IDs (e.g., '101') and MongoDB ObjectIds.
 */
const userSchema = new mongoose.Schema(
    {
        customId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },
        name: {
            type: String,
            required: [true, 'name is required and must be a non-empty string.'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'email is required and must be a valid email address.'],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'email is required and must be a valid email address.'],
        },
        role: {
            type: String,
            enum: ['student', 'faculty', 'staff', 'admin'],
            default: 'student',
            trim: true,
        },
        department: {
            type: String,
            default: 'Information Technology',
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
            default: '',
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'suspended'],
            default: 'active',
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret.customId || ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            transform: (doc, ret) => {
                ret.id = ret.customId || ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

// Schema unique indexes already declared on fields (email, customId)

const User = mongoose.model('User', userSchema);

module.exports = User;
