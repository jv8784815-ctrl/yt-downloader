// api/proxy/[...path].js
const GIST_URL = 'https://gist.githubusercontent.com/jv8784815-ctrl/020306f12721bdba9314ea0559008d11/raw/tunnel.json';

let tunnelUrl = null;
let tunnelCachedAt = 0;
const TUNNEL_TTL = 5 * 60 * 1000;

async function getTunnelUrl() {
  // Si tenemos cache válido, usarlo
  if (tunnelUrl && Date.now() - tunnelCachedAt < TUNNEL_TTL) {
    console.log('[Proxy] 📦 Usando tunnel cacheado:', tunnelUrl);
    return tunnelUrl;
  }

  try {
    console.log('[Proxy] 🔄 Obteniendo tunnel del Gist...');
    const res = await fetch(GIST_URL, {
      headers: { 
        'Cache-Control': 'no-cache',
        'User-Agent': 'Vercel-Serverless'
      },
      timeout: 10000
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log('[Proxy] 📥 Datos del Gist:', data);
    
    const url = data?.tunnel?.trimEnd('/');

    if (url && url.startsWith('https://')) {
      tunnelUrl = url;
      tunnelCachedAt = Date.now();
      console.log('[Proxy] ✅ Tunnel actualizado:', tunnelUrl);
      return tunnelUrl;
    } else {
      throw new Error('URL de tunnel inválida: ' + url);
    }
  } catch (error) {
    console.error('[Proxy] ❌ Error obteniendo tunnel:', error.message);
    
    // Si tenemos tunnel antiguo, usarlo como fallback
    if (tunnelUrl) {
      console.log('[Proxy] ⚠️ Usando tunnel antiguo como fallback:', tunnelUrl);
      return tunnelUrl;
    }
    
    return null;
  }
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('ngrok-skip-browser-warning', 'true');

  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Obtener el path original
  const path = req.query.path?.join('/') || '';
  
  console.log(`[Proxy] 📥 Petición recibida: ${req.method} /api/${path}`);
  console.log('[Proxy] 📋 Query params:', req.query);
  console.log('[Proxy] 📋 Body:', req.body);

  // Obtener el tunnel
  const tunnel = await getTunnelUrl();

  if (!tunnel) {
    console.error('[Proxy] ❌ No hay tunnel disponible');
    return res.status(503).json({ 
      error: 'Servicio no disponible', 
      message: 'No se pudo obtener el tunnel. Intenta más tarde.',
      details: 'El Gist no respondió o no hay tunnel disponible'
    });
  }

  try {
    // Construir URL de destino
    const targetPath = path ? `/api/${path}` : '/api';
    const targetUrl = new URL(targetPath, tunnel);
    
    // Copiar parámetros de consulta
    Object.keys(req.query).forEach(key => {
      if (key !== 'path') {
        targetUrl.searchParams.set(key, req.query[key]);
      }
    });

    console.log(`[Proxy] 🔄 ${req.method} ${targetPath} → ${targetUrl.toString()}`);

    // Preparar headers
    const headers = {
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'Vercel-Serverless-Proxy'
    };
    
    // Copiar headers relevantes
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'];
    }

    // Preparar body
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers['content-type']?.includes('application/json')) {
        body = JSON.stringify(req.body);
      } else if (req.headers['content-type']?.includes('multipart/form-data')) {
        body = req.body;
      } else {
        body = req.body;
      }
    }

    // Hacer la petición al tunnel
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: body,
    });

    console.log(`[Proxy] 📥 Respuesta del tunnel: ${response.status}`);

    // Obtener los datos
    const responseHeaders = response.headers;
    const contentType = responseHeaders.get('content-type') || '';

    // Para archivos (video, audio, imágenes, descargas)
    if (
      contentType.includes('video') ||
      contentType.includes('audio') ||
      contentType.includes('image') ||
      contentType.includes('octet-stream') ||
      contentType.includes('application/zip') ||
      path.includes('stream') ||
      path.includes('download')
    ) {
      // Obtener el buffer
      const buffer = await response.arrayBuffer();
      
      // Configurar headers de respuesta
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', responseHeaders.get('content-length') || buffer.byteLength);
      
      // Si hay content-disposition, pasarlo
      if (responseHeaders.get('content-disposition')) {
        res.setHeader('Content-Disposition', responseHeaders.get('content-disposition'));
      }
      
      // Enviar el buffer
      return res.status(response.status).send(Buffer.from(buffer));
    }

    // Para JSON y texto
    let data;
    try {
      data = await response.text();
      
      // Intentar parsear como JSON para mantener consistencia
      try {
        const jsonData = JSON.parse(data);
        return res.status(response.status).json(jsonData);
      } catch (e) {
        // Si no es JSON, enviar como texto
        res.setHeader('Content-Type', contentType || 'text/plain');
        return res.status(response.status).send(data);
      }
    } catch (error) {
      console.error('[Proxy] ❌ Error leyendo respuesta:', error);
      return res.status(500).json({ 
        error: 'Error al leer la respuesta del tunnel',
        message: error.message 
      });
    }

  } catch (error) {
    console.error('[Proxy] ❌ Error en petición:', error);
    return res.status(500).json({ 
      error: 'Error al procesar la petición',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
