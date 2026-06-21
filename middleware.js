// middleware.js
import { NextResponse } from 'next/server';

const GIST_URL = 'https://gist.githubusercontent.com/jv8784815-ctrl/020306f12721bdba9314ea0559008d11/raw/tunnel.json';
let tunnelUrl = null;
let tunnelCachedAt = 0;
const TUNNEL_TTL = 5 * 60 * 1000; // 5 minutos

async function getTunnelUrl() {
  // Si ya tenemos tunnel y no ha expirado, usarlo
  if (tunnelUrl && Date.now() - tunnelCachedAt < TUNNEL_TTL) {
    return tunnelUrl;
  }

  try {
    console.log('[Middleware] 🔄 Obteniendo tunnel del Gist...');
    const res = await fetch(GIST_URL, {
      headers: { 
        'Cache-Control': 'no-cache',
        'User-Agent': 'Vercel-Middleware'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const url = data?.tunnel?.trimEnd('/');

    if (url && url.startsWith('https://')) {
      tunnelUrl = url;
      tunnelCachedAt = Date.now();
      console.log(`[Middleware] ✅ Tunnel actualizado: ${tunnelUrl}`);
      return tunnelUrl;
    } else {
      throw new Error('URL de tunnel inválida');
    }
  } catch (error) {
    console.error(`[Middleware] ❌ Error obteniendo tunnel: ${error.message}`);
    
    // Si tenemos tunnel antiguo, usarlo como fallback
    if (tunnelUrl) {
      console.log(`[Middleware] ⚠️ Usando tunnel antiguo como fallback: ${tunnelUrl}`);
      return tunnelUrl;
    }
    
    return null;
  }
}

export async function middleware(request) {
  const url = request.nextUrl.clone();
  const path = url.pathname;

  // Solo procesar rutas de API
  if (path.startsWith('/api/')) {
    // Manejar OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const tunnel = await getTunnelUrl();

    if (!tunnel) {
      console.error('[Middleware] ❌ No hay tunnel disponible');
      return new NextResponse(
        JSON.stringify({ 
          error: 'Servicio no disponible', 
          message: 'No se pudo obtener el tunnel. Intenta más tarde.' 
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    try {
      // Construir URL de destino
      const targetUrl = new URL(path, tunnel);
      
      // Copiar parámetros de consulta
      url.searchParams.forEach((value, key) => {
        targetUrl.searchParams.set(key, value);
      });

      console.log(`[Middleware] 🔄 ${request.method} ${path} → ${targetUrl.toString()}`);

      // Preparar headers
      const headers = new Headers(request.headers);
      headers.delete('host');
      headers.delete('origin');
      headers.delete('referer');
      headers.set('ngrok-skip-browser-warning', 'true');
      headers.set('Accept-Encoding', 'gzip, deflate, br');

      // Preparar body
      let body = null;
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          body = await request.json();
          body = JSON.stringify(body);
        } else if (contentType.includes('multipart/form-data')) {
          body = await request.formData();
        } else {
          body = await request.arrayBuffer();
        }
      }

      // Hacer la petición al tunnel
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: body,
        duplex: 'half',
      });

      // Obtener el content-type para manejar diferentes tipos de respuesta
      const contentType = response.headers.get('content-type') || '';

      // Para archivos (video, audio, imágenes, etc.)
      if (
        contentType.includes('video') ||
        contentType.includes('audio') ||
        contentType.includes('image') ||
        contentType.includes('octet-stream') ||
        contentType.includes('application/zip') ||
        path.includes('/stream/') ||
        path.includes('/download/')
      ) {
        // Para descargas, obtener el nombre del archivo
        const contentDisposition = response.headers.get('content-disposition');
        const fileName = contentDisposition 
          ? contentDisposition.split('filename=')[1]?.replace(/["']/g, '') 
          : null;

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        responseHeaders.set('ngrok-skip-browser-warning', 'true');

        // Si es un archivo, devolverlo como stream
        return new NextResponse(response.body, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      // Para JSON y texto
      let data;
      try {
        data = await response.text();
        // Intentar parsear como JSON para mantener consistencia
        try {
          const jsonData = JSON.parse(data);
          data = JSON.stringify(jsonData);
        } catch (e) {
          // Si no es JSON, mantener como texto
        }
      } catch (error) {
        data = 'Error al leer la respuesta';
      }

      // Crear headers de respuesta
      const responseHeaders = new Headers();
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      responseHeaders.set('ngrok-skip-browser-warning', 'true');
      
      // Mantener content-type de la respuesta original
      if (response.headers.get('content-type')) {
        responseHeaders.set('content-type', response.headers.get('content-type'));
      }

      return new NextResponse(data, {
        status: response.status,
        headers: responseHeaders,
      });

    } catch (error) {
      console.error(`[Middleware] ❌ Error en petición:`, error.message);
      return new NextResponse(
        JSON.stringify({ 
          error: 'Error al procesar la petición', 
          message: error.message 
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  }

  // Para rutas no-API, continuar normalmente
  return NextResponse.next();
}

// Configurar para que solo ejecute en rutas API
export const config = {
  matcher: '/api/:path*',
};
