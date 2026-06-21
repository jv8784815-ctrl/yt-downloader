// api/proxy/[...path].js
const GIST_URL = 'https://gist.githubusercontent.com/jv8784815-ctrl/020306f12721bdba9314ea0559008d11/raw/tunnel.json';
let tunnelUrl = null;
let tunnelCachedAt = 0;
const TUNNEL_TTL = 5 * 60 * 1000;

async function getTunnelUrl() {
  if (tunnelUrl && Date.now() - tunnelCachedAt < TUNNEL_TTL) {
    return tunnelUrl;
  }

  try {
    console.log('[Proxy] 🔄 Obteniendo tunnel del Gist...');
    const res = await fetch(GIST_URL, {
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const url = data?.tunnel?.trimEnd('/');

    if (url && url.startsWith('https://')) {
      tunnelUrl = url;
      tunnelCachedAt = Date.now();
      console.log(`[Proxy] ✅ Tunnel: ${tunnelUrl}`);
      return tunnelUrl;
    } else {
      throw new Error('URL de tunnel inválida');
    }
  } catch (error) {
    console.error(`[Proxy] ❌ Error: ${error.message}`);
    if (tunnelUrl) {
      console.log(`[Proxy] ⚠️ Usando tunnel antiguo: ${tunnelUrl}`);
      return tunnelUrl;
    }
    return null;
  }
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const tunnel = await getTunnelUrl();

  if (!tunnel) {
    return res.status(503).json({ 
      error: 'Servicio no disponible',
      message: 'No se pudo obtener el tunnel'
    });
  }

  // Obtener el path original
  const path = req.query.path?.join('/') || '';
  const targetPath = path ? `/api/${path}` : '/api';
  
  // Construir URL de destino
  const targetUrl = new URL(targetPath, tunnel);
  
  // Copiar parámetros de consulta
  Object.keys(req.query).forEach(key => {
    if (key !== 'path') {
      targetUrl.searchParams.set(key, req.query[key]);
    }
  });

  try {
    console.log(`[Proxy] 🔄 ${req.method} ${targetPath} → ${targetUrl.toString()}`);

    // Preparar headers
    const headers = new Headers();
    headers.set('ngrok-skip-browser-warning', 'true');
    
    // Copiar headers relevantes
    const relevantHeaders = ['content-type', 'authorization', 'user-agent'];
    relevantHeaders.forEach(header => {
      if (req.headers[header]) {
        headers.set(header, req.headers[header]);
      }
    });

    // Preparar body
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = req.body;
    }

    // Hacer la petición al tunnel
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(body) : undefined,
    });

    // Obtener datos
    const data = await response.text();

    // Devolver respuesta
    res.status(response.status);
    
    if (response.headers.get('content-type')) {
      res.setHeader('content-type', response.headers.get('content-type'));
    }

    try {
      // Intentar parsear como JSON
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch {
      // Si no es JSON, enviar como texto
      res.send(data);
    }

  } catch (error) {
    console.error(`[Proxy] ❌ Error:`, error.message);
    res.status(500).json({ 
      error: 'Error al procesar la petición',
      message: error.message 
    });
  }
}
