const mongoose = require('mongoose');

/**
 * Product Data Model — CampusConnect Microservices Architecture
 * Web Services & SOA Laboratory • Lab 6
 *
 * Enforces schema integrity, positive price validation, and stock constraints.
 * Supports both custom numeric IDs (e.g., '501') and MongoDB ObjectIds.
 */
const productSchema = new mongoose.Schema(
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
        description: {
            type: String,
            default: '',
            trim: true,
        },
        price: {
            type: Number,
            required: [true, 'price is required and must be a positive number.'],
            min: [0, 'price must be greater than or equal to 0.'],
        },
        category: {
            type: String,
            enum: ['Books', 'Electronics', 'Lab Equipment', 'Stationery', 'Apparel', 'General'],
            default: 'General',
            trim: true,
        },
        stock: {
            type: Number,
            required: [true, 'stock is required.'],
            min: [0, 'stock cannot be negative.'],
            default: 20,
            validate: {
                validator: Number.isInteger,
                message: 'stock must be an integer.',
            },
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

// Indexes
productSchema.index({ name: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
