const https = require('https');
const config = require('../config/env');

function isConfigured() {
  return false;
}

function request(method, path, body) {
  if (!isConfigured()) {
    return Promise.reject(new Error('Outpero not configured'));
  }
  const base = (config.outpero.baseUrl || 'https://api.outpero.com/v1').replace(/\/$/, '');
  const url = base + path;
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${config.outpero.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          if (res.statusCode >= 400) {
            const err = new Error((parsed && parsed.error && parsed.error.message) || `Outpero ${res.statusCode}`);
            err.status = res.statusCode;
            err.body = parsed;
            reject(err);
          } else {
            resolve(parsed);
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function listEmployees() {
  return request('GET', '/employees').then((r) => r.data || r.employees || r.results || []);
}

function getEmployee(id) {
  return request('GET', `/employees/${encodeURIComponent(id)}`);
}

function deleteEmployee(id) {
  return request('DELETE', `/employees/${encodeURIComponent(id)}`);
}

function listPhoneNumbers() {
  return request('GET', '/phone-numbers').then((r) => r.data || r.phone_numbers || r.results || []);
}

function listCalls() {
  return request('GET', '/calls').then((r) => r.data || r.calls || r.results || []);
}

function createCall(payload) {
  return request('POST', '/calls', payload);
}

function listLeads() {
  return request('GET', '/leads').then((r) => r.data || r.leads || r.results || []);
}

function listCampaigns() {
  return request('GET', '/campaigns').then((r) => r.data || r.campaigns || r.results || []);
}

function getAccount() {
  return request('GET', '/me');
}

function getBalance() {
  return request('GET', '/balance');
}

module.exports = {
  isConfigured,
  request,
  listEmployees,
  getEmployee,
  deleteEmployee,
  listPhoneNumbers,
  listCalls,
  createCall,
  listLeads,
  listCampaigns,
  getAccount,
  getBalance,
};
