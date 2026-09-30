/**
 * serviceRegistry.js — Configuration-Based Service Discovery Layer
 * Web Services & SOA Laboratory • Lab 7
 *
 * Implements externalized service registry:
 * - Reads service locations from environment variables or registry.json
 * - Eliminates hardcoded URLs in route-handling code
 * - Provides dynamic routing table inspection and live updates
 */

const fs = require('fs');
const path = require('path');

class ServiceRegistry {
    constructor() {
        this.configPath = path.join(__dirname, 'registry.json');
        this.services = {};
        this.loadConfiguration();
    }

    /**
     * Load configuration from file with environment variable overrides
     */
    loadConfiguration() {
        let fileConfig = {};
        try {
            if (fs.existsSync(this.configPath)) {
                let raw = fs.readFileSync(this.configPath, 'utf8');
                raw = raw.replace(/^\uFEFF/, '').trim(); // Remove UTF-8 BOM if present
                fileConfig = JSON.parse(raw).services || {};
            }
        } catch (err) {
            console.warn('[ServiceRegistry] Notice: Fallback to default service discovery configuration:', err.message);
        }

        // Environment variables take precedence over config file (Twelve-Factor App)
        this.services = {
            userService: {
                name: fileConfig.userService?.name || 'User Service',
                url: (process.env.USER_SERVICE_URL || fileConfig.userService?.url || 'http://user-service:3001').replace(/\/$/, ''),
                prefix: fileConfig.userService?.prefix || '/users',
                timeout: parseInt(process.env.SERVICE_TIMEOUT || fileConfig.userService?.timeout || '5000', 10),
                description: fileConfig.userService?.description || 'User identity and account management'
            },
            productService: {
                name: fileConfig.productService?.name || 'Product Service',
                url: (process.env.PRODUCT_SERVICE_URL || fileConfig.productService?.url || 'http://product-service:3002').replace(/\/$/, ''),
                prefix: fileConfig.productService?.prefix || '/products',
                timeout: parseInt(process.env.SERVICE_TIMEOUT || fileConfig.productService?.timeout || '5000', 10),
                description: fileConfig.productService?.description || 'Product catalog and stock management'
            },
            orderService: {
                name: fileConfig.orderService?.name || 'Order Service',
                url: (process.env.ORDER_SERVICE_URL || fileConfig.orderService?.url || 'http://order-service:3003').replace(/\/$/, ''),
                prefix: fileConfig.orderService?.prefix || '/orders',
                timeout: parseInt(process.env.SERVICE_TIMEOUT || fileConfig.orderService?.timeout || '5000', 10),
                description: fileConfig.orderService?.description || 'Order processing and inter-service validation'
            }
        };

        console.log('[ServiceRegistry] Service discovery table initialized:');
        Object.entries(this.services).forEach(([key, s]) => {
            console.log(`  • ${s.name.padEnd(16)} -> ${s.url} (Path: ${s.prefix})`);
        });
    }

    getService(serviceKey) {
        return this.services[serviceKey] || null;
    }

    getAllServices() {
        return this.services;
    }

    getRoutingTable() {
        return Object.entries(this.services).map(([key, s]) => ({
            key,
            serviceName: s.name,
            routePrefix: s.prefix,
            targetUrl: s.url,
            timeoutMs: s.timeout
        }));
    }

    updateServiceUrl(serviceKey, newUrl) {
        if (!this.services[serviceKey]) {
            throw new Error(`Service '${serviceKey}' not found in registry.`);
        }
        const oldUrl = this.services[serviceKey].url;
        this.services[serviceKey].url = newUrl.replace(/\/$/, '');
        console.log(`[ServiceRegistry] Updated '${serviceKey}' target URL: ${oldUrl} -> ${this.services[serviceKey].url}`);
        return this.services[serviceKey];
    }
}

const instance = new ServiceRegistry();
module.exports = instance;
