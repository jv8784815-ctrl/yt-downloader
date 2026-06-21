export default async function handler(req, res) {
  try {
    // Obtener la configuración del gist
    const gistResponse = await fetch('https://gist.githubusercontent.com/jv8784815-ctrl/020306f12721bdba9314ea0559008d11/raw/tunnel.json');
    
    if (!gistResponse.ok) {
      throw new Error(`No se pudo obtener el gist: ${gistResponse.statusText}`);
    }
    
    const gistContent = await gistResponse.text();
    const config = JSON.parse(gistContent);
    
    // Obtener la URL base del primer rewrite
    const baseUrl = config.rewrites[0].destination.replace(/\/api\/.*/, '');
    
    // Extraer la ruta que se está pidiendo
    const fullPath = req.url.replace('/api/proxy', '') || '/';
    const targetUrl = `${baseUrl}${fullPath}`;
    
    console.log(`[PROXY] Forwarding to: ${targetUrl}`);
    
    // Preparar headers
    const forwardHeaders = {
      ...req.headers,
    };
    delete forwardHeaders.host;
    
    // Hacer la petición al backend real
    const backendResponse = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    
    // Obtener la respuesta
    const contentType = backendResponse.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await backendResponse.json();
    } else {
      data = await backendResponse.text();
    }
    
    // Copiar headers relevantes
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    res.status(backendResponse.status).send(data);
  } catch (error) {
    console.error('[PROXY ERROR]', error);
    res.status(500).json({ 
      error: error.message,
      message: 'Error en el proxy'
    });
  }
}
