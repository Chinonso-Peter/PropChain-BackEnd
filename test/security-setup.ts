import * as fs from 'fs';
import * as path from 'path';

// Security test setup
beforeAll(async () => {
  console.log('Setting up security test environment...');
  
  // Set security-specific environment
  process.env.NODE_ENV = 'security';
  process.env.LOG_LEVEL = 'error'; // Reduce noise during security tests
});

afterAll(async () => {
  console.log('Cleaning up security test environment...');
});

// Security testing utilities
global.assertSecurityHeaders = (response: any, expectedHeaders: Record<string, string>) => {
  const headers = response.headers;
  const missingHeaders = [];
  
  for (const [header, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = headers[header.toLowerCase()];
    if (!actualValue) {
      missingHeaders.push(`${header} (missing)`);
    } else if (expectedValue && actualValue !== expectedValue) {
      missingHeaders.push(`${header} (expected: ${expectedValue}, got: ${actualValue})`);
    }
  }
  
  if (missingHeaders.length > 0) {
    throw new Error(`Missing or incorrect security headers: ${missingHeaders.join(', ')}`);
  }
};

global.assertNoSensitiveData = (response: any) => {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
  ];
  
  const responseBody = JSON.stringify(response.body);
  const violations = [];
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(responseBody)) {
      violations.push(pattern.source);
    }
  }
  
  if (violations.length > 0) {
    throw new Error(`Sensitive data exposed in response: ${violations.join(', ')}`);
  }
};

global.assertRateLimiting = async (makeRequest: () => Promise<any>, limit: number, windowMs: number) => {
  const requests = [];
  const startTime = Date.now();
  
  // Make requests rapidly
  for (let i = 0; i < limit + 5; i++) {
    try {
      const response = await makeRequest();
      requests.push({
        status: response.status,
        timestamp: Date.now() - startTime,
        success: response.status < 400,
      });
    } catch (error) {
      requests.push({
        status: error.response?.status || 500,
        timestamp: Date.now() - startTime,
        success: false,
      });
    }
  }
  
  const successful = requests.filter(r => r.success);
  const rateLimited = requests.filter(r => r.status === 429);
  
  if (rateLimited.length === 0) {
    throw new Error('No rate limiting detected - expected 429 responses');
  }
  
  if (successful.length > limit) {
    throw new Error(`Rate limiting not enforced - ${successful.length} successful requests (limit: ${limit})`);
  }
  
  console.log(`Rate limiting test passed: ${successful.length} successful, ${rateLimited.length} rate limited`);
  
  return { successful, rateLimited, requests };
};

global.assertInputValidation = async (makeRequest: (payload: any) => Promise<any>, invalidPayloads: any[]) => {
  const violations = [];
  
  for (const payload of invalidPayloads) {
    try {
      const response = await makeRequest(payload);
      if (response.status < 400) {
        violations.push({
          payload,
          error: `Expected validation error but got ${response.status}`,
        });
      }
    } catch (error) {
      const status = error.response?.status || 500;
      if (status < 400) {
        violations.push({
          payload,
          error: `Expected validation error but got ${status}`,
        });
      }
    }
  }
  
  if (violations.length > 0) {
    throw new Error(`Input validation failed:\n${violations.map(v => `- Payload: ${JSON.stringify(v.payload)} - ${v.error}`).join('\n')}`);
  }
  
  console.log(`Input validation passed: ${invalidPayloads.length} invalid payloads rejected`);
};

global.assertAuthenticationRequired = async (makeRequest: () => Promise<any>) => {
  try {
    const response = await makeRequest();
    if (response.status !== 401) {
      throw new Error(`Expected 401 Unauthorized but got ${response.status}`);
    }
  } catch (error) {
    const status = error.response?.status || 500;
    if (status !== 401) {
      throw new Error(`Expected 401 Unauthorized but got ${status}`);
    }
  }
  
  console.log('Authentication requirement verified');
};

global.assertAuthorizationRequired = async (makeRequest: () => Promise<any>) => {
  try {
    const response = await makeRequest();
    if (response.status !== 403) {
      throw new Error(`Expected 403 Forbidden but got ${response.status}`);
    }
  } catch (error) {
    const status = error.response?.status || 500;
    if (status !== 403) {
      throw new Error(`Expected 403 Forbidden but got ${status}`);
    }
  }
  
  console.log('Authorization requirement verified');
};

// SQL Injection testing utilities
global.assertSqlInjectionSafe = async (makeRequest: (input: string) => Promise<any>) => {
  const sqlInjectionPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "' UNION SELECT * FROM users --",
    "1'; DELETE FROM users WHERE 't'='t",
    "' OR 1=1 --",
    "admin'--",
    "admin' /*",
    "' OR 'x'='x",
  ];
  
  const violations = [];
  
  for (const payload of sqlInjectionPayloads) {
    try {
      const response = await makeRequest(payload);
      
      // Check if response contains database error messages
      const responseBody = JSON.stringify(response.body);
      const dbErrorPatterns = [
        /sql/i,
        /mysql/i,
        /postgresql/i,
        /sqlite/i,
        /ora-/i,
        /syntax error/i,
        /unclosed/i,
      ];
      
      for (const pattern of dbErrorPatterns) {
        if (pattern.test(responseBody)) {
          violations.push({
            payload,
            error: `Database error pattern detected: ${pattern.source}`,
          });
        }
      }
      
      // Check if response indicates successful injection (e.g., unexpected data returned)
      if (response.status === 200 && response.body && typeof response.body === 'object') {
        // Look for signs of successful injection
        if (response.body.length > 1 || (response.body.id && response.body.password)) {
          violations.push({
            payload,
            error: 'Possible successful SQL injection detected',
          });
        }
      }
    } catch (error) {
      // Network errors are acceptable for injection attempts
      if (!error.response) {
        continue;
      }
    }
  }
  
  if (violations.length > 0) {
    throw new Error(`SQL Injection vulnerabilities detected:\n${violations.map(v => `- Payload: "${v.payload}" - ${v.error}`).join('\n')}`);
  }
  
  console.log(`SQL injection safety verified: ${sqlInjectionPayloads.length} payloads tested`);
};

// XSS testing utilities
global.assertXssSafe = async (makeRequest: (input: string) => Promise<any>) => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src="x" onerror="alert(\'xss\')">',
    '<svg onload="alert(\'xss\')">',
    'javascript:alert("xss")',
    '<iframe src="javascript:alert(\'xss\')"></iframe>',
    '<body onload="alert(\'xss\')">',
    '<input onfocus="alert(\'xss\')" autofocus>',
    '<select onfocus="alert(\'xss\')" autofocus>',
    '<textarea onfocus="alert(\'xss\')" autofocus>',
    '<keygen onfocus="alert(\'xss\')" autofocus>',
    '<video><source onerror="alert(\'xss\')">',
    '<audio src="x" onerror="alert(\'xss\')">',
  ];
  
  const violations = [];
  
  for (const payload of xssPayloads) {
    try {
      const response = await makeRequest(payload);
      const responseBody = JSON.stringify(response.body);
      
      // Check if XSS payload is reflected in response
      if (responseBody.includes(payload)) {
        violations.push({
          payload,
          error: 'XSS payload reflected in response',
        });
      }
      
      // Check for HTML tags in response
      if (/<[^>]*>/.test(responseBody)) {
        violations.push({
          payload,
          error: 'HTML content detected in response',
        });
      }
    } catch (error) {
      // Network errors are acceptable for XSS attempts
      if (!error.response) {
        continue;
      }
    }
  }
  
  if (violations.length > 0) {
    throw new Error(`XSS vulnerabilities detected:\n${violations.map(v => `- Payload: "${v.payload}" - ${v.error}`).join('\n')}`);
  }
  
  console.log(`XSS safety verified: ${xssPayloads.length} payloads tested`);
};
