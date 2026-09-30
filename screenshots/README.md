# Lab 7: API Gateway, Service Discovery & Cloud Deployment — Screenshot Evidence Guide

This folder contains the visual execution evidence required by **Section 8 (Submission Requirements)** and **Section 10 (Final Checklist)** of `Assignment-Lab-7.pdf`.

---

## 📸 Required Screenshot Checklist & File Naming

| # | Filename | Description | Source / Command |
|---|---|---|---|
| **01** | `01_architecture_diagram.png` | Lab 7 Layered Architecture Diagram | Open `architecture-diagram.svg` in browser |
| **02** | `02_gateway_service_registry.png` | Service Discovery configuration | VS Code view of `config/serviceRegistry.js` & `registry.json` |
| **03** | `03_docker_compose_isolation.png` | Docker Compose showing ONLY port 8080 exposed | VS Code view of `compose.yaml` (expose vs ports) |
| **04** | `04_docker_compose_ps.png` | All 5 containers running | Terminal: `docker compose ps` |
| **05** | `05_direct_port_blocked.png` | Proof direct port 3001 access is blocked | Terminal / Browser: `http://localhost:3001` (Connection Refused) |
| **06** | `06_postman_gateway_health.png` | Gateway Health Check | Postman: `GET http://localhost:8080/health` (200 OK) |
| **07** | `07_postman_gateway_routes.png` | Service Discovery inspection | Postman: `GET http://localhost:8080/routes` (200 OK) |
| **08** | `08_postman_routed_users.png` | Gateway proxy to User Service | Postman: `GET http://localhost:8080/users` (200 OK) |
| **09** | `09_postman_routed_products.png` | Gateway proxy to Product Service | Postman: `GET http://localhost:8080/products` (200 OK) |
| **10** | `10_postman_routed_orders.png` | Gateway proxy to Order Service | Postman: `POST http://localhost:8080/orders` (201 Created) |
| **11** | `11_postman_unreachable_502.png`| Centralized 502/503 on service stop | Postman: `GET http://localhost:8080/users` (502 Bad Gateway) |
| **12** | `12_postman_recovery_200.png` | Automatic recovery after service restart | Postman: `GET http://localhost:8080/users` (200 OK) |
| **13** | `13_automated_test_suite_pass.png` | Automated test suite execution | Terminal: `.\test_lab7_gateway.ps1 -IncludeContainerLifecycleTests` (100% Pass) |
| **14** | `14_cloud_deployment_dashboard.png`| Cloud platform dashboard / CLI | Render / Railway / Cloud deployment proof |
