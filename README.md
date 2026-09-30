# CampusConnect — Lab 7: API Gateway, Service Discovery & Cloud Deployment

**Course:** Web Services & Service-Oriented Architecture (WS_SOA)  
**Laboratory Practical:** Lab 7 — API Gateway, Configuration-Based Service Discovery & Cloud Deployment  
**Student Name:** Param Patel  
**Student Roll No:** 202512089  
**Technology Stack:** Docker • Docker Compose • Node.js / Express • http-proxy-middleware • MongoDB Atlas • Postman  

---

## Table of Contents
1. [Project Overview & Lab Context](#1-project-overview--lab-context)
2. [Architecture & Layering Model](#2-architecture--layering-model)
3. [Discussion Question: Why Introduce an API Gateway?](#3-discussion-question-why-introduce-an-api-gateway)
4. [API Gateway Implementation & Features](#4-api-gateway-implementation--features)
5. [Discussion Question: Static Config vs Dynamic Service Discovery](#5-discussion-question-static-config-vs-dynamic-service-discovery)
6. [Configuration-Based Service Discovery Layer](#6-configuration-based-service-discovery-layer)
7. [Docker Compose & Network Isolation (`compose.yaml`)](#7-docker-compose--network-isolation-composeyaml)
8. [Centralized 502/503 Error Handling & Resilience](#8-centralized-502503-error-handling--resilience)
9. [Cloud Deployment & MongoDB Atlas Integration](#9-cloud-deployment--mongodb-atlas-integration)
10. [Postman Testing & API Route Verification](#10-postman-testing--api-route-verification)
11. [Written Reflection (Lab 6 vs Lab 7)](#11-written-reflection-lab-6-vs-lab-7)
12. [Troubleshooting Guide & Common Issues](#12-troubleshooting-guide--common-issues)
13. [Final Verification Checklist](#13-final-verification-checklist)

---

## 1. Project Overview & Lab Context

In **Lab 6**, the monolithic backend was decomposed into three independently runnable microservices (`user-service`, `product-service`, `order-service`) communicating over a shared Docker bridge network (`campus-network`), while the API Gateway was discussed conceptually.

In **Lab 7**, the system achieves enterprise-grade maturity by:
1. **Building a Real API Gateway (`api-gateway`):** Acts as the **single public entry point** for all clients, eliminating direct client-to-service communication.
2. **Configuration-Based Service Discovery:** Externalizes service locations from route-handling code into a structured registry (`registry.json` and dynamic environment variables).
3. **Strict Network Isolation:** In `compose.yaml`, **only the gateway's port (`8080`) is exposed externally**. The backend services (`user-service:3001`, `product-service:3002`, `order-service:3003`) reside solely inside the private Docker network and cannot be accessed directly from the host.
4. **Cloud Deployment & MongoDB Atlas:** Moving the database persistence layer to MongoDB Atlas and preparing containerized services for cloud deployment (Render, Railway, Fly.io, or AWS/Azure VMs).

---

## 2. Architecture & Layering Model

```
+-----------------------------------------------------------------------------------------+
|                               Client / Postman (Internet)                               |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             | HTTP Requests to Public Port :8080 ONLY
                                             v
+-----------------------------------------------------------------------------------------+
|                       API GATEWAY (api-gateway:8080) [PUBLIC]                           |
|  - Single Entry Point           - Service Registry Discovery (config/serviceRegistry.js)|
|  - Request Logging Middleware   - Centralized 502/503 Error Handling                    |
+--------------------------------------------+--------------------------------------------+
                                             |
                 Docker Bridge Network: campus-network [PRIVATE / INTERNAL]
                 (Direct Host Access to Ports 3001 / 3002 / 3003 is BLOCKED)
                                             |
         +-----------------------------------+-----------------------------------+
         |                                   |                                   |
         v                                   v                                   v
+-----------------------+           +-----------------------+           +-----------------------+
|     User Service      |           |    Product Service    |           |     Order Service     |
|   (user-service)      |           |  (product-service)    |           |   (order-service)     |
|  Internal Port: 3001  |           |  Internal Port: 3002  |           |  Internal Port: 3003  |
+-----------+-----------+           +-----------+-----------+           +-----------+-----------+
            |                                   |                                   |
            |                                   +<──────────────────────────────────+
            | (Internal REST GET /users/:id)                                        | (Internal REST GET /products/:id)
            +<──────────────────────────────────────────────────────────────────────+
            |                                   |                                   |
            v                                   v                                   v
+-----------------------+           +-----------------------+           +-----------------------+
|  User DB (user_db)    |           | Prod DB (product_db)  |           | Order DB (order_db)   |
|   MongoDB / Atlas     |           |   MongoDB / Atlas     |           |   MongoDB / Atlas     |
+-----------------------+           +-----------------------+           +-----------------------+
```

---

## 3. Discussion Question: Why Introduce an API Gateway?

> **Question:** *Why introduce an API Gateway instead of letting clients call each service directly? Think about a single entry point, hiding internal structure, and centralizing concerns like logging and error handling.*

### Comprehensive Answer:
1. **Single Public Ingress Point:** In a multi-service architecture, exposing dozens of internal ports to clients creates tight coupling. With an API Gateway, web browsers, mobile apps, and third-party consumers need only **one base URL**. If backend services move to different hosts or ports, clients remain unaffected.
2. **Encapsulation & Security (Hiding Internal Topology):** Without a gateway, internal service ports (`3001`, `3002`, `3003`) and private Docker networking details are exposed to the public internet, increasing the attack surface. The gateway acts as a security perimeter—only the gateway port (`8080`) is exposed, while internal microservices reside safely inside a private Docker bridge network.
3. **Centralized Cross-Cutting Concerns:**
   * **Structured Logging & Audit Trails:** Every incoming request, timestamp, method, target route, and latency is recorded in one centralized location rather than having fragmented logging across multiple services.
   * **Centralized Error Handling:** When a downstream service crashes or times out, the gateway catches the failure and returns a clean, standardized `502 Bad Gateway` / `503 Service Unavailable` response rather than leaking stack traces or leaving sockets hanging.
   * **CORS Management & SSL Termination:** Cross-Origin Resource Sharing and HTTPS certificates are configured once at the gateway layer, shielding backend microservices from complex security overhead.
4. **Chatty Client Optimization & Protocol Abstraction:** The gateway can aggregate calls or translate protocols (e.g., HTTP/2, WebSocket, gRPC) while backend services communicate over lightweight internal protocols.

---

## 4. API Gateway Implementation & Features

The `api-gateway` service is built with Express and `http-proxy-middleware`:

* **No Business Logic:** The gateway strictly handles routing, proxying, and cross-cutting concerns.
* **Health Endpoint (`GET /health`):** Reports gateway uptime, status, and the registered routing table.
* **Service Discovery Routes (`GET /routes`):** Exposes current upstream service mappings.
* **Reverse Proxy Mappings:**
  * `/users/*` → User Service (`http://user-service:3001`)
  * `/products/*` → Product Service (`http://product-service:3002`)
  * `/orders/*` → Order Service (`http://order-service:3003`)
* **Request Logger:** Emits timestamped audit entries:
  `[API-GATEWAY] [2026-09-30T...] GET /users/101 -> Status: 200 (14ms)`

---

## 5. Discussion Question: Static Config vs Dynamic Service Discovery

> **Question:** *Contrast this static/config-based approach with dynamic service discovery (e.g. Consul, Eureka, Kubernetes DNS) - what would a dynamic registry add that a static config file cannot?*

### Detailed Comparison:

| Feature | Static / Configuration-Based (This Lab) | Dynamic Service Discovery (Consul / Eureka / K8s DNS) |
| :--- | :--- | :--- |
| **Registration** | Service URLs are manually declared in config files (`registry.json`) or environment variables. | **Automatic Self-Registration:** Containers register themselves upon startup via agents or control plane. |
| **Instance Scaling** | Requires manual config edits and gateway reloads to add replica instances. | **Auto-Scaling Support:** Automatically adds new replicas to the routing table as traffic scales up or down. |
| **Health Checking** | Passive: Gateway detects unreachability only after a client request fails (returning 502). | **Active Heartbeats:** Regularly pings instances; instantly removes dead containers *before* clients encounter errors. |
| **Load Balancing** | Gateway forwards to a single static URL. | **Built-in Load Balancing:** Dynamically distributes load across healthy instances (Round-Robin, Least Connections). |
| **Zero Downtime** | Updating addresses requires restarting containers or pushing config changes. | **Zero-Downtime Rolling Updates:** Seamlessly redirects traffic to new container versions without service interruption. |

---

## 6. Configuration-Based Service Discovery Layer

In [`api-gateway/config/serviceRegistry.js`](./api-gateway/config/serviceRegistry.js), service definitions are decoupled from route code:

```javascript
// Externalized configuration loaded from registry.json and environment variables
const services = {
  userService: {
    name: 'User Service',
    url: process.env.USER_SERVICE_URL || 'http://user-service:3001',
    prefix: '/users'
  },
  productService: {
    name: 'Product Service',
    url: process.env.PRODUCT_SERVICE_URL || 'http://product-service:3002',
    prefix: '/products'
  },
  orderService: {
    name: 'Order Service',
    url: process.env.ORDER_SERVICE_URL || 'http://order-service:3003',
    prefix: '/orders'
  }
};
```

### Proving Config-Driven Routing Without Code Changes:
The gateway includes a configuration update endpoint (`PUT /registry/:serviceKey`) and reads dynamic environment variables at boot, allowing target ports or hostnames to change without modifying a single line of proxy code.

---

## 7. Docker Compose & Network Isolation (`compose.yaml`)

In strict compliance with Lab 7 requirements:
* **`api-gateway`:** `ports: ["8080:8080"]` (The **ONLY** port exposed to the host machine).
* **`user-service`:** `expose: ["3001"]` (Reachable **ONLY** inside `campus-network`).
* **`product-service`:** `expose: ["3002"]` (Reachable **ONLY** inside `campus-network`).
* **`order-service`:** `expose: ["3003"]` (Reachable **ONLY** inside `campus-network`).

```yaml
services:
  api-gateway:
    build: ./api-gateway
    container_name: api-gateway
    ports:
      - "8080:8080" # ONLY EXPOSED PORT
    environment:
      USER_SERVICE_URL: http://user-service:3001
      PRODUCT_SERVICE_URL: http://product-service:3002
      ORDER_SERVICE_URL: http://order-service:3003
    networks:
      - campus-network

  user-service:
    build: ./user-service
    container_name: user-service
    expose:
      - "3001" # No host port mapping!
    networks:
      - campus-network
```

---

## 8. Centralized 502/503 Error Handling & Resilience

When a downstream microservice is crashed or stopped, the gateway catches the connection exception and returns a structured `502 Bad Gateway` response:

```json
{
  "success": false,
  "error": "Bad Gateway / Service Unavailable",
  "gateway": "api-gateway",
  "targetService": "User Service",
  "targetUrl": "http://user-service:3001/users",
  "statusCode": 502,
  "errorCode": "ECONNREFUSED",
  "message": "The upstream microservice 'User Service' is currently unreachable or timed out. Please check service health."
}
```

---

## 9. Cloud Deployment & MongoDB Atlas Integration

### Cloud MongoDB Atlas Setup:
Each service connects to cloud MongoDB Atlas by setting `MONGO_URI` in `.env`:
```env
MONGO_URI=mongodb+srv://campusadmin:<password>@cluster0.mongodb.net/user_db?retryWrites=true&w=majority
```

### Deploying Containers to Cloud (e.g. Render / Railway / Fly.io):
1. **GitHub Repository:** Push your `Lab_7` repository to GitHub.
2. **Deploy on Render (Blueprint or Web Service):**
   * Create a Web Service connected to your repo.
   * Point to `api-gateway/Dockerfile` or deploy multi-service using Render Blueprint (`render.yaml`).
   * Set Environment Variables:
     * `USER_SERVICE_URL=https://campusconnect-users.onrender.com`
     * `PRODUCT_SERVICE_URL=https://campusconnect-products.onrender.com`
     * `ORDER_SERVICE_URL=https://campusconnect-orders.onrender.com`
3. **Public Gateway URL:**
   Once deployed, the gateway provides a public URL (e.g., `https://campusconnect-gateway.onrender.com`).
4. **Postman Verification on Cloud:**
   Switch the Postman variable `{{gateway_url}}` to your public cloud URL and verify all routes pass across the public internet.

---

## 10. Postman Testing & API Route Verification

Import [`Microservices_Lab_7.postman_collection.json`](./Microservices_Lab_7.postman_collection.json) into Postman:

| Test Case | Method | Route | Expected Status |
| :--- | :---: | :--- | :---: |
| **Gateway Health** | `GET` | `http://localhost:8080/health` | `200 OK` |
| **Service Discovery Table** | `GET` | `http://localhost:8080/routes` | `200 OK` |
| **Routed Users** | `GET` | `http://localhost:8080/users` | `200 OK` |
| **Routed User by ID** | `GET` | `http://localhost:8080/users/101` | `200 OK` |
| **Routed Products** | `GET` | `http://localhost:8080/products` | `200 OK` |
| **Routed Product by ID** | `GET` | `http://localhost:8080/products/501` | `200 OK` |
| **Routed Order Creation** | `POST`| `http://localhost:8080/orders` | `201 Created` |
| **Unreachable Service Test** | `GET` | `http://localhost:8080/users` *(when user-service stopped)* | `502 Bad Gateway` |
| **Host Port Block Test** | `GET` | `http://localhost:3001/users` *(from host)* | **Connection Refused** |

---

## 11. Written Reflection (Lab 6 vs Lab 7)

> *In Lab 6, clients communicated with multiple disparate endpoints directly across localhost, exposing internal port architecture and requiring the client to maintain knowledge of each individual service location. With Lab 7's API Gateway and cloud deployment, the entire system presents a single, unified entry point that completely abstracts internal microservices behind a private Docker network. Operating the application shifted from managing individual local services to managing a cohesive, cloud-reachable distributed system with centralized observability, standardized 502/503 error handling, and configuration-driven service discovery.*

---

## 12. Troubleshooting Guide & Common Issues

| Issue / Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| `ECONNREFUSED` on port 3001 from host | Working as designed! Lab 7 removes host port mappings from backend services. | Access all endpoints through the API Gateway at `http://localhost:8080/users`. |
| `502 Bad Gateway` from API Gateway | Target microservice container is stopped or still starting up. | Run `docker compose ps` to check container status, and inspect logs with `docker compose logs user-service`. |
| Gateway cannot resolve `http://user-service:3001` | Containers are not on the same Docker network. | Verify both `api-gateway` and backend services have `networks: - campus-network` in `compose.yaml`. |
| MongoDB Atlas Connection Timeout | IP Access List in MongoDB Atlas is blocking incoming traffic. | Add `0.0.0.0/0` (Allow Access from Anywhere) in your Atlas Network Access settings. |

---

## 13. Final Verification Checklist

- [x] Dedicated `api-gateway` service built with Express and `http-proxy-middleware`.
- [x] Configuration-based service discovery implemented (`config/serviceRegistry.js` + `registry.json`).
- [x] Only the API Gateway port (`8080`) is exposed externally in `compose.yaml`.
- [x] Direct access to backend ports (`3001`, `3002`, `3003`) from host is verified as blocked.
- [x] Reverse-proxy routing functional for `/users`, `/products`, `/orders`.
- [x] Centralized request logging and 502/503 error handling active.
- [x] Architecture diagram (`architecture-diagram.svg`) updated with layered boundary model.
- [x] Postman collection (`Microservices_Lab_7.postman_collection.json`) created.
- [x] Automated test runner (`test_lab7_gateway.ps1`) provided.
- [x] Comprehensive report, discussions, and reflection documented in `README.md`.
