import json
import os

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

try:
    from .audit_logger import CipherTubeAuditLogger
except ImportError:
    from audit_logger import CipherTubeAuditLogger

app = FastAPI(title="Cipher-Tube Real-Time Security Dashboard", version="1.0.0")
logger = CipherTubeAuditLogger()


@app.get("/api/analytics")
def get_analytics():
    summary = logger.get_audit_summary()
    events = []

    if os.path.exists(logger.log_path):
        with open(logger.log_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    events.reverse()
    return {"summary": summary, "recentEvents": events[:20]}


@app.get("/", response_class=HTMLResponse)
def dashboard_home():
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Cipher-Tube C2PA Security Dashboard</title>
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
            .container { max-width: 1000px; margin: 0 auto; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; }
            .card .value { font-size: 28px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; background: #1e293b; border: 1px solid #334155; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔒 Cipher-Tube C2PA Security Dashboard</h1>
            <div class="grid">
                <div class="card"><h3>Total Verifications</h3><div class="value" id="total-events">0</div></div>
                <div class="card"><h3>Successful Passes</h3><div class="value" id="success-count">0</div></div>
                <div class="card"><h3>Tamper Alerts</h3><div class="value" id="tamper-alerts">0</div></div>
            </div>
            <table>
                <thead><tr><th>Timestamp</th><th>Asset ID</th><th>Status</th><th>Tamper Status</th></tr></thead>
                <tbody id="event-table-body"></tbody>
            </table>
        </div>
        <script>
            async function fetchAnalytics() {
                const res = await fetch('/api/analytics');
                const data = await res.json();
                document.getElementById('total-events').innerText = data.summary.totalEvents;
                document.getElementById('success-count').innerText = data.summary.successCount;
                document.getElementById('tamper-alerts').innerText = data.summary.tamperAlerts;
                const tbody = document.getElementById('event-table-body');
                tbody.innerHTML = '';
                data.recentEvents.forEach(ev => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${ev.timestamp}</td><td>${ev.assetId}</td><td>${ev.status}</td><td>${ev.tamperDetected ? '⚠️ TAMPERED' : 'Clean'}</td>`;
                    tbody.appendChild(tr);
                });
            }
            fetchAnalytics();
            setInterval(fetchAnalytics, 5000);
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("dashboard_server:app", host="0.0.0.0", port=8001, reload=True)
