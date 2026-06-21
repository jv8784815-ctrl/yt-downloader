// middleware.js
import { NextResponse } from 'next/server';

const GIST_URL = 'https://gist.githubusercontent.com/jv8784815-ctrl/020306f12721bdba9314ea0559008d11/raw/tunnel.json';
let tunnelUrl = null;
let tunnelCachedAt = 0;
const TUNNEL_TTL = 5 * 60 * 1000;

async function getTunnelUrl() {
  if (tunnelUrl && Date.now() - tunnelCachedAt < TUNNEL_TTL) return tunnelUrl;
  try {
    const res = await fetch(GIST_URL, { timeout: 8000 });
    const data = await res.json();
    const url = data?.tunnel?.trimEnd('/');
    if (url) {
      tunnelUrl = url;
      tunnelCachedAt = Date.now();
      console.log(`[Middleware] 🌐 Tunnel: ${tunnelUrl}`);
    }
  } catch (e) {
    console.error(`[Middleware] ⚠️ No se pudo obtener tunnel URL: ${e.message}`);
  }
  return tunnelUrl;
}

export async function middleware(request) {
  const url = request.nextUrl.clone();
  const path = url.pathname;

  // Solo redirigir rutas de API
  if (path.startsWith('/api/')) {
    const tunnel = await getTunnelUrl();
    
    if (tunnel) {
      // Reemplazar la URL de destino con el tunnel dinámico
      const newUrl = new URL(path, tunnel);
      
      // Reenviar los parámetros de consulta
      newUrl.search = url.search;
      
      // Reenviar la petición al tunnel
      const headers = new Headers(request.headers);
      headers.set('Host', new URL(tunnel).host);
      
      // Crear nueva petición
      const response = await fetch(newUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
      });
      
      // Devolver la respuesta
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      responseHeaders.set('ngrok-skip-browser-warning', 'true');
      
      return new NextResponse(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
