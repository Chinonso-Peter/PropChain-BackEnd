import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const API_URL = (__ENV.API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const configuredHealthPath = __ENV.HEALTH_PATH || '/api/v1/health/liveness';
const HEALTH_PATH = configuredHealthPath.startsWith('/') ? configuredHealthPath : `/${configuredHealthPath}`;

export default function () {
  const res = http.get(`${API_URL}${HEALTH_PATH}`);
  check(res, {
    'health status is 200': r => r.status === 200,
  });
  sleep(1);
}

