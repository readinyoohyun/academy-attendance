const https = require('https');
const { URL } = require('url');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let bodyData = '';
  if (req.method === 'POST') {
    bodyData = await new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => { resolve(body); });
    });
  }

  try {
    const data = await fetchWithRedirect(url, req.method, bodyData);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function fetchWithRedirect(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const performRequest = (targetUrl) => {
      try {
        const parsedUrl = new URL(targetUrl);
        const options = {
          method,
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };
        
        if (method === 'POST' && body) {
          options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
          options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = https.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, targetUrl).toString();
            performRequest(redirectUrl);
            return;
          }

          const chunks = [];
          res.on('data', (chunk) => { chunks.push(chunk); });
          res.on('end', () => {
            const rawData = Buffer.concat(chunks).toString('utf8');
            resolve(rawData);
          });
        });

        req.on('error', (e) => {
          reject(e);
        });

        if (method === 'POST' && body) {
          req.write(body);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    };

    performRequest(url);
  });
}
