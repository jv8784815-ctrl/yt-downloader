export default async function handler(req, res) {
    const API_BASE = 'https://mazier-bounteously-justice.ngrok-free.dev';
    
    try {
        const response = await fetch(`${API_BASE}/api/tasks`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
