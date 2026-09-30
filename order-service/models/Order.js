const mongoose = require('mongoose');

/**
 * Order Data Model — CampusConnect Microservices Architecture
 * Web Services & SOA Laboratory • Lab 6
 *
 * Implements Database-Per-Service pattern:
 * Order Service owns order data and stores validated snapshots of referenced User and Product resources.
 * It NEVER queries user_db or product_db directly.
 */
const orderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            unique: true,
            required: true,
            trim: true,
        },
        userId: {
            type: String,
            required: [true, 'userId is required to identify the ordering user.'],
            trim: true,
        },
        productId: {
            type: String,
            required: [true, 'productId is required to identify the ordered product.'],
            trim: true,
        },
        quantity: {
            type: Number,
            required: [true, 'quantity is required.'],
            min: [1, 'quantity must be at least 1.'],
            validate: {
                validator: Number.isInteger,
                message: 'quantity must be an integer.',
            },
        },
        unitPrice: {
            type: Number,
            required: [true, 'unitPrice is required.'],
            min: [0, 'unitPrice must be greater than or equal to 0.'],
        },
        totalAmount: {
            type: Number,
            required: [true, 'totalAmount is required.'],
            min: [0, 'totalAmount must be greater than or equal to 0.'],
        },
        status: {
            type: String,
            enum: ['CONFIRMED', 'PENDING', 'CANCELLED', 'COMPLETED'],
            default: 'CONFIRMED',
        },
        userSnapshot: {
            name: { type: String },
            email: { type: String },
            department: { type: String },
        },
        productSnapshot: {
            name: { type: String },
            category: { type: String },
            price: { type: Number },
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (doc, ret) => {
                ret.id = ret.orderId || ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            transform: (doc, ret) => {
                ret.id = ret.orderId || ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            },
        },
    }
);

// Indexes
orderSchema.index({ userId: 1 });
orderSchema.index({ productId: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
