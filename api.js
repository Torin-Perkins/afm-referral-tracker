// Small helper for talking to the Apps Script backend.
// Uses text/plain so the browser doesn't send a CORS preflight, which
// Apps Script can't answer.
window.callApi = async function callApi(payload) {
  const url = (window.APP_CONFIG && window.APP_CONFIG.SCRIPT_URL) || '';
  if (!/^https:\/\/script\.google\.com\//.test(url)) {
    throw new Error('The site isn\'t connected to Google Sheets yet. Set SCRIPT_URL in config.js.');
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error('Couldn\'t reach the server. Check your connection and try again.');
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('The server sent an unexpected response. Check the Web App deployment settings.');
  }
  return data;
};
