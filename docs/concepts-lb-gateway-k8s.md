# Load Balancer vs API Gateway vs Kubernetes — Revision Notes

Quick-reference for the written-defense/interview questions on traffic distribution.
Companion to [architecture.md](architecture.md) and [deployment.md](deployment.md) — this
file is concept revision, those are this project's actual decisions.

## Proxy terminology, precisely

Only two directions exist. There is no "backward proxy."

| Term | Sits in front of | Hides | Example |
|------|------------------|-------|---------|
| **Forward proxy** | the client | the client, from the server | corporate proxy, VPN |
| **Reverse proxy** | the server(s) | the backend, from the client | Nginx, ALB, this project's Gateway |

An **API Gateway** = a reverse proxy + extra responsibilities layered on top: routing by
path, auth/authz, rate limiting, sometimes transformation. A **Load Balancer** is also a
reverse proxy, but with one narrow job: distribute traffic across *identical* replicas of
the *same* service.

| | Gateway | Load Balancer |
|---|---------|----------------|
| Routes by | **what** the request is (`/urls*` → Write, `/:code` → Read) | **which instance** should handle it (any of the N identical replicas) |
| Backends behind it | different services | copies of the same service |
| Extra jobs | auth, rate-limit, routing logic | health checks, pick-an-instance algorithm |

## Why services scale independently (the 100:1 example)

Read:write ratio ≈ 100:1 (see [scaling.md](scaling.md)'s worked capacity estimate). At
10,000 req/sec total: ~9,900/sec reads, ~100/sec writes.

- One Write Service instance handles ~200 req/sec comfortably → **1-2 instances** is enough
  (2 for HA, not throughput).
- One Read Service instance handles ~500 req/sec → 9,900 ÷ 500 ≈ **20 instances** needed.

If read and write were one undifferentiated service, scaling to meet read demand would
force 20 copies of the write logic too — 18-19 of them sitting idle. Splitting them (see
[ADR 0001](adr/0001-split-read-write-services.md)) means paying for capacity per actual
demand, not the max of the two.

**Every layer with >1 replica needs its own traffic-distribution point** — this repeats at
each tier, it isn't a special case for any one of them:

```
Internet → [Cloud LB / Ingress] → Gateway ×N
                                       │ (routes by path — a *gateway* decision)
                        ┌──────────────┴───────────────┐
                  [Service/LB]                   [Service/LB]
                  Write ×1-2                      Read ×20
```

Each `[Service/LB]` box is a separate load-balancing decision, picking among *that layer's*
own replica pool only. A layer with a single instance doesn't need one — but then that
instance is a single point of failure (see `deployment.md`'s topology: "Gateway down → run
≥2 behind a load balancer").

## Two jobs that get conflated

**Job 1 — pick an existing replica for this request.** Fast, happens on every request,
sub-millisecond. In Kubernetes: a **Service** (a stable internal DNS name) plus its
networking layer spreads requests across whatever replicas currently exist. It never
creates anything — only picks among what's already running.

**Job 2 — grow or shrink the replica pool.** Slow, periodic, decoupled from any single
request. In Kubernetes: the **Horizontal Pod Autoscaler (HPA)** checks metrics (CPU,
queue depth, custom metrics) every ~15-30s and decides to add/remove replicas. New
replicas take real time to start, connect to the DB, and become "ready" — no individual
request waits for this. A traffic spike gets routed to whatever replicas exist *right now*;
the HPA catches up moments later, not instantly.

Gateway → backend flow, concretely:

1. Gateway's proxy `target` is never a specific replica's IP — it's a stable address
   (a Kubernetes Service name, or a small internal load balancer) representing "the write
   service" / "the read service" as a whole.
2. Whatever's on the other end of that stable address is what actually spreads the
   request across replicas (Job 1) — invisible to the gateway's own code.
3. Separately, the HPA (or equivalent) keeps that replica pool sized to current load
   (Job 2) — also invisible to the gateway.

The gateway's `createProxyMiddleware({ target })` config only ever needs to know the one
stable address — never individual replica identities.

## Common load-balancing algorithms (for the written defense)

| Algorithm | Picks by | Good for |
|-----------|----------|----------|
| Round robin | 1, 2, 3, 1, 2, 3... | simple, even distribution, ignores instance load |
| Least connections | fewest active requests | variable request durations |
| IP hash / consistent hashing | same client → same instance | session affinity, cache locality (less relevant here — cache is shared Redis, not per-instance) |

Health checks run alongside all of these: an unresponsive instance is pulled out of
rotation automatically — this is what "one instance dies, traffic keeps flowing" actually
means mechanically, not something the application code has to detect and handle itself.

## What's real in this project vs conceptual-only

Per this project's own [Scope Honesty](../REQUIREMENTS.md#scope-honesty) rule: single-node
per service throughout, "multiple instances" = 2 local processes, not a real cluster. The
Kubernetes Service / HPA / cloud-LB layer described above is real production infrastructure
knowledge for the interview defense — it is **not** something implemented or run as part of
this build. `deployment.md`'s production topology diagram is the target shape; this repo
never actually provisions it.
