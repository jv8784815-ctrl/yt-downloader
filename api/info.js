export default async function handler(req, res) {
    const { url } = req.query;
    const API_BASE = 'http://64.20.54.50:30325';
    
    try {
        const response = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
