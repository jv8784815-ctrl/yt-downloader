// api/test.js
export default async function handler(req, res) {
  const GIST_URL = 'https://gist.githubusercontent.com/jv8784815-ctrl/020306f12721bdba9314ea0559008d11/raw/tunnel.json';
  
  try {
    const response = await fetch(GIST_URL);
    const data = await response.json();
    
    res.status(200).json({
      success: true,
      message: 'API funcionando correctamente',
      gist: data,
      tunnel: data?.tunnel
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
