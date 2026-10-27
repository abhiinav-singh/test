"""
WebSentinel — Backend Server

FastAPI application with WebSocket endpoint for real-time network event streaming.
Broadcasts simulated normal traffic and accepts injected attack events.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .simulator import (
    generate_normal_event,
    get_base_connections,
    get_topology,
    ATTACKER_NODE,
)
from .detector import ThreatDetector

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("websentinel")

# ── State ────────────────────────────────────────────────────────────────────
connected_clients: list[WebSocket] = []
event_queue: asyncio.Queue = asyncio.Queue()
detector = ThreatDetector()
active_threats: list[dict] = []
attacker_links: set[tuple[str, str]] = set()


# ── Broadcast helper ─────────────────────────────────────────────────────────
async def broadcast(message: dict):
    """Send a JSON message to all connected WebSocket clients."""
    data = json.dumps(message)
    disconnected = []
    for ws in connected_clients:
        try:
            await ws.send_text(data)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in connected_clients:
            connected_clients.remove(ws)


# ── Background tasks ─────────────────────────────────────────────────────────
async def normal_traffic_loop():
    """Emit normal network events at steady intervals."""
    while True:
        event = generate_normal_event()

        # Run through detector (normal events shouldn't trigger, but just in case)
        threat = detector.analyze(event)
        if threat:
            event["threat"] = True
            event["severity"] = threat["severity"]
            event["message"] = threat["message"]
            event["threat_type"] = threat["threat_type"]
            event["details"] = threat["details"]

        await broadcast(event)
        # Random interval: 1–3 seconds for natural feel
        await asyncio.sleep(1.0 + (hash(event["timestamp"]) % 2000) / 1000)


async def injected_event_consumer():
    """Consume events from the injection queue and broadcast them."""
    while True:
        event = await event_queue.get()

        # Whenever an event touches ATTACKER_NODE (as source OR target) and not linked yet
        source_id = event.get("source_node")
        target_id = event.get("target_node")
        if source_id == ATTACKER_NODE["id"] or target_id == ATTACKER_NODE["id"]:
            link = (source_id, target_id)
            if link not in attacker_links:
                attacker_links.add(link)
                await broadcast({
                    "type": "topology_update",
                    "action": "add_node",
                    "node": ATTACKER_NODE,
                    "connection": {
                        "source": source_id,
                        "target": target_id,
                    },
                })
                # Small delay so frontend can process the new node
                await asyncio.sleep(0.3)

        # Run through detector
        threat = detector.analyze(event)
        if threat:
            event["threat"] = True
            event["severity"] = threat["severity"]
            event["message"] = threat["message"]
            event["threat_type"] = threat["threat_type"]
            event["details"] = threat["details"]
            active_threats.append(event)

        await broadcast(event)
        event_queue.task_done()


# ── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background tasks on startup."""
    traffic_task = asyncio.create_task(normal_traffic_loop())
    consumer_task = asyncio.create_task(injected_event_consumer())
    logger.info("WebSentinel backend started — streaming network events")
    yield
    traffic_task.cancel()
    consumer_task.cancel()


# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="WebSentinel",
    description="Real-time network threat visualization backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── WebSocket Endpoint ───────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)
    logger.info(f"Client connected — {len(connected_clients)} active")

    # Send initial topology including attacker node and links if active
    topology_nodes = get_topology()
    topology_conns = get_base_connections()

    if attacker_links:
        topology_nodes.append(ATTACKER_NODE)
        for src, tgt in attacker_links:
            if not any(
                (c["source"] == src and c["target"] == tgt) or
                (c["source"] == tgt and c["target"] == src)
                for c in topology_conns
            ):
                topology_conns.append({"source": src, "target": tgt})

    topology = {
        "type": "topology",
        "nodes": topology_nodes,
        "connections": topology_conns,
    }
    await ws.send_text(json.dumps(topology))

    try:
        while True:
            # Keep connection alive; client doesn't send data normally
            data = await ws.receive_text()
            # Could handle client commands here in the future
    except WebSocketDisconnect:
        if ws in connected_clients:
            connected_clients.remove(ws)
        logger.info(f"Client disconnected — {len(connected_clients)} active")


# ── REST Injection Endpoint ──────────────────────────────────────────────────
class InjectedEvent(BaseModel):
    type: str = "network_event"
    timestamp: str = ""
    source_node: str = ""
    source_ip: str = ""
    source_hostname: str = ""
    target_node: str = ""
    target_ip: str = ""
    target_hostname: str = ""
    event_type: str = ""
    port: int = 0
    threat: bool = False
    severity: str = "none"
    message: str = ""


@app.post("/inject")
async def inject_event(event: InjectedEvent):
    """Inject an event into the broadcast stream (used by simulate_attack.py)."""
    event_dict = event.model_dump()
    if not event_dict["timestamp"]:
        event_dict["timestamp"] = datetime.now(timezone.utc).isoformat()
    await event_queue.put(event_dict)
    return {"status": "queued", "event_type": event_dict["event_type"]}


@app.post("/inject/batch")
async def inject_batch(events: list[InjectedEvent]):
    """Inject multiple events at once."""
    for event in events:
        event_dict = event.model_dump()
        if not event_dict["timestamp"]:
            event_dict["timestamp"] = datetime.now(timezone.utc).isoformat()
        await event_queue.put(event_dict)
    return {"status": "queued", "count": len(events)}


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "clients": len(connected_clients),
        "active_threats": len(active_threats),
    }
