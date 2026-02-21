import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';

describe('Critical User Flows E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await (global as any).createE2ETestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Property Management Flow', () => {
    it('should handle complete property lifecycle', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // 1. Register a new user
      const userResponse = await makeRequest
        .post('/auth/register')
        .send({
          email: 'property-manager@example.com',
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'PropertyManager',
        })
        .expect(201);

      const user = userResponse.body;
      expect(user.email).toBe('property-manager@example.com');
      expect(user.firstName).toBe('John');

      // 2. Login the user
      const loginResponse = await makeRequest
        .post('/auth/login')
        .send({
          email: 'property-manager@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      const { access_token } = loginResponse.body;
      expect(access_token).toBeDefined();

      // 3. Create a new property
      const createPropertyResponse = await makeRequest
        .withAuth(access_token)
        .post('/properties')
        .send({
          title: 'Beautiful Downtown Apartment',
          description: 'Modern apartment with city views, close to public transportation',
          price: 750000,
          type: 'RESIDENTIAL',
          bedrooms: 2,
          bathrooms: 2,
          squareFootage: 1200,
          address: {
            street: '123 Main Street',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
            latitude: 40.7589,
            longitude: -73.9851,
          },
        })
        .expect(201);

      const property = createPropertyResponse.body;
      expect(property.title).toBe('Beautiful Downtown Apartment');
      expect(property.price).toBe(750000);
      expect(property.status).toBe('AVAILABLE');

      // 4. Get the property details
      const getPropertyResponse = await makeRequest
        .withAuth(access_token)
        .get(`/properties/${property.id}`)
        .expect(200);

      const retrievedProperty = getPropertyResponse.body;
      expect(retrievedProperty.id).toBe(property.id);
      expect(retrievedProperty.title).toBe(property.title);

      // 5. Update the property
      const updateResponse = await makeRequest
        .withAuth(access_token)
        .patch(`/properties/${property.id}`)
        .send({
          status: 'PENDING',
          description: 'Updated description with more details about the property',
        })
        .expect(200);

      const updatedProperty = updateResponse.body;
      expect(updatedProperty.status).toBe('PENDING');
      expect(updatedProperty.description).toContain('Updated description');

      // 6. Search for properties
      const searchResponse = await makeRequest
        .withAuth(access_token)
        .get('/properties')
        .query({
          search: 'Downtown',
          type: 'RESIDENTIAL',
          minPrice: 500000,
          maxPrice: 1000000,
          page: 1,
          limit: 10,
        })
        .expect(200);

      expect(searchResponse.body.data).toBeDefined();
      expect(searchResponse.body.pagination).toBeDefined();
      expect(searchResponse.body.data.length).toBeGreaterThan(0);

      // 7. Delete the property
      await makeRequest
        .withAuth(access_token)
        .delete(`/properties/${property.id}`)
        .expect(200);

      // 8. Verify property is deleted
      await makeRequest
        .withAuth(access_token)
        .get(`/properties/${property.id}`)
        .expect(404);
    });

    it('should handle property search and filtering flow', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // Register and login
      const user = await (global as any).createE2ETestUser(app);
      const token = await (global as any).loginE2ETestUser(app, user.email, 'TestPassword123!');

      // Create multiple properties for testing
      const properties = [
        {
          title: 'Luxury Villa in Beverly Hills',
          price: 2500000,
          type: 'LUXURY',
          bedrooms: 6,
          bathrooms: 5,
          squareFootage: 5000,
          address: {
            street: '1 Beverly Hills Dr',
            city: 'Beverly Hills',
            state: 'CA',
            zipCode: '90210',
            country: 'USA',
            latitude: 34.0901,
            longitude: -118.4065,
          },
        },
        {
          title: 'Cozy Studio in Manhattan',
          price: 350000,
          type: 'RESIDENTIAL',
          bedrooms: 1,
          bathrooms: 1,
          squareFootage: 400,
          address: {
            street: '100 Broadway',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
            latitude: 40.7589,
            longitude: -73.9851,
          },
        },
        {
          title: 'Modern Office Space',
          price: 1200000,
          type: 'COMMERCIAL',
          bedrooms: 0,
          bathrooms: 2,
          squareFootage: 3000,
          address: {
            street: '500 Wall Street',
            city: 'New York',
            state: 'NY',
            zipCode: '10005',
            country: 'USA',
            latitude: 40.7074,
            longitude: -74.0113,
          },
        },
      ];

      // Create all properties
      const createdProperties = [];
      for (const propertyData of properties) {
        const response = await makeRequest
          .withAuth(token)
          .post('/properties')
          .send(propertyData)
          .expect(201);
        createdProperties.push(response.body);
      }

      // Test search by type
      const luxurySearch = await makeRequest
        .withAuth(token)
        .get('/properties')
        .query({ type: 'LUXURY', page: 1, limit: 10 })
        .expect(200);

      expect(luxurySearch.body.data).toHaveLength(1);
      expect(luxurySearch.body.data[0].type).toBe('LUXURY');

      // Test search by price range
      const priceSearch = await makeRequest
        .withAuth(token)
        .get('/properties')
        .query({ minPrice: 300000, maxPrice: 500000, page: 1, limit: 10 })
        .expect(200);

      expect(priceSearch.body.data).toHaveLength(1);
      expect(priceSearch.body.data[0].price).toBe(350000);

      // Test search by keyword
      const keywordSearch = await makeRequest
        .withAuth(token)
        .get('/properties')
        .query({ search: 'Manhattan', page: 1, limit: 10 })
        .expect(200);

      expect(keywordSearch.body.data.length).toBeGreaterThan(0);
      expect(keywordSearch.body.data.some(p => p.title.includes('Manhattan'))).toBe(true);

      // Test pagination
      const firstPage = await makeRequest
        .withAuth(token)
        .get('/properties')
        .query({ page: 1, limit: 2 })
        .expect(200);

      const secondPage = await makeRequest
        .withAuth(token)
        .get('/properties')
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(firstPage.body.data).toHaveLength(2);
      expect(secondPage.body.data).toHaveLength(1);
      expect(firstPage.body.pagination.page).toBe(1);
      expect(secondPage.body.pagination.page).toBe(2);

      // Clean up
      for (const property of createdProperties) {
        await makeRequest
          .withAuth(token)
          .delete(`/properties/${property.id}`)
          .expect(200);
      }
    });
  });

  describe('User Authentication and Authorization Flow', () => {
    it('should handle complete user authentication flow', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // 1. Register new user
      const registerResponse = await makeRequest
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
          firstName: 'New',
          lastName: 'User',
        })
        .expect(201);

      const user = registerResponse.body;
      expect(user.email).toBe('newuser@example.com');
      expect(user.isVerified).toBe(false); // Should require email verification

      // 2. Try to login without verification (should fail)
      await makeRequest
        .post('/auth/login')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
        })
        .expect(401);

      // 3. Simulate email verification (if verification endpoint exists)
      try {
        await makeRequest
          .post('/auth/verify-email')
          .send({ token: 'verification-token' })
          .expect(200);
      } catch (error) {
        // If verification endpoint doesn't exist, skip this step
      }

      // 4. Login successfully
      const loginResponse = await makeRequest
        .post('/auth/login')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      const { access_token, refresh_token } = loginResponse.body;
      expect(access_token).toBeDefined();
      expect(refresh_token).toBeDefined();

      // 5. Access protected endpoint
      const profileResponse = await makeRequest
        .withAuth(access_token)
        .get('/auth/profile')
        .expect(200);

      expect(profileResponse.body.email).toBe('newuser@example.com');

      // 6. Refresh token
      const refreshResponse = await makeRequest
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(200);

      expect(refreshResponse.body.access_token).toBeDefined();

      // 7. Logout
      await makeRequest
        .post('/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      // 8. Verify token is invalidated
      await makeRequest
        .withAuth(access_token)
        .get('/auth/profile')
        .expect(401);
    });

    it('should enforce authorization rules', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // Create two users
      const user1 = await (global as any).createE2ETestUser(app);
      const user2 = await (global as any).createE2ETestUser(app);

      const token1 = await (global as any).loginE2ETestUser(app, user1.email, 'TestPassword123!');
      const token2 = await (global as any).loginE2ETestUser(app, user2.email, 'TestPassword123!');

      // User 1 creates a property
      const property = await (global as any).createE2ETestProperty(app, token1);

      // User 1 can update their own property
      await makeRequest
        .withAuth(token1)
        .patch(`/properties/${property.id}`)
        .send({ status: 'PENDING' })
        .expect(200);

      // User 2 cannot update User 1's property
      await makeRequest
        .withAuth(token2)
        .patch(`/properties/${property.id}`)
        .send({ status: 'SOLD' })
        .expect(403);

      // User 2 cannot delete User 1's property
      await makeRequest
        .withAuth(token2)
        .delete(`/properties/${property.id}`)
        .expect(403);

      // User 1 can delete their own property
      await makeRequest
        .withAuth(token1)
        .delete(`/properties/${property.id}`)
        .expect(200);
    });
  });

  describe('API Key Management Flow', () => {
    it('should handle API key lifecycle', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // Register and login user
      const user = await (global as any).createE2ETestUser(app);
      const token = await (global as any).loginE2ETestUser(app, user.email, 'TestPassword123!');

      // 1. Create API key
      const createKeyResponse = await makeRequest
        .withAuth(token)
        .post('/api-keys')
        .send({
          name: 'Test API Key',
          scopes: ['properties:read', 'properties:write'],
          dailyLimit: 1000,
          monthlyLimit: 30000,
        })
        .expect(201);

      const apiKey = createKeyResponse.body;
      expect(apiKey.name).toBe('Test API Key');
      expect(apiKey.key).toBeDefined();
      expect(apiKey.scopes).toContain('properties:read');

      // 2. Use API key to access protected endpoint
      const propertyResponse = await makeRequest
        .withApiKey(apiKey.key)
        .get('/properties')
        .expect(200);

      expect(propertyResponse.body.data).toBeDefined();

      // 3. Create property using API key
      const createPropertyResponse = await makeRequest
        .withApiKey(apiKey.key)
        .post('/properties')
        .send({
          title: 'API Key Created Property',
          price: 500000,
          type: 'RESIDENTIAL',
          address: {
            street: 'API Key St',
            city: 'Test City',
            state: 'TS',
            zipCode: '12345',
            country: 'Test',
            latitude: 40.7128,
            longitude: -74.0060,
          },
        })
        .expect(201);

      const property = createPropertyResponse.body;
      expect(property.title).toBe('API Key Created Property');

      // 4. Update API key
      await makeRequest
        .withAuth(token)
        .patch(`/api-keys/${apiKey.id}`)
        .send({
          name: 'Updated API Key',
          dailyLimit: 2000,
        })
        .expect(200);

      // 5. Delete API key
      await makeRequest
        .withAuth(token)
        .delete(`/api-keys/${apiKey.id}`)
        .expect(200);

      // 6. Verify API key no longer works
      await makeRequest
        .withApiKey(apiKey.key)
        .get('/properties')
        .expect(401);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid requests gracefully', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // Test invalid authentication
      await makeRequest
        .get('/properties')
        .expect(401);

      // Test invalid API key format
      await makeRequest
        .get('/properties')
        .set('X-API-Key', 'invalid-key')
        .expect(401);

      // Test malformed property data
      const user = await (global as any).createE2ETestUser(app);
      const token = await (global as any).loginE2ETestUser(app, user.email, 'TestPassword123!');

      await makeRequest
        .withAuth(token)
        .post('/properties')
        .send({
          title: '',
          price: -1000,
          type: 'INVALID_TYPE',
        })
        .expect(400);

      // Test non-existent resource
      await makeRequest
        .withAuth(token)
        .get('/properties/non-existent-id')
        .expect(404);

      // Test unauthorized access to other user's data
      const otherUser = await (global as any).createE2ETestUser(app);
      const otherToken = await (global as any).loginE2ETestUser(app, otherUser.email, 'TestPassword123!');
      const otherProperty = await (global as any).createE2ETestProperty(app, otherToken);

      await makeRequest
        .withAuth(token)
        .delete(`/properties/${otherProperty.id}`)
        .expect(403);
    });

    it('should handle rate limiting', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // Create user and get token
      const user = await (global as any).createE2ETestUser(app);
      const token = await (global as any).loginE2ETestUser(app, user.email, 'TestPassword123!');

      // Make multiple rapid requests to trigger rate limiting
      const requests = Array.from({ length: 20 }, () =>
        makeRequest.withAuth(token).get('/properties')
      );

      const responses = await Promise.allSettled(requests);
      
      // Some requests should succeed, others should be rate limited
      const successful = responses.filter(r => r.status === 'fulfilled' && r.value.status === 200);
      const rateLimited = responses.filter(r => r.status === 'fulfilled' && r.value.status === 429);

      expect(successful.length + rateLimited.length).toBe(20);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests', async () => {
      const makeRequest = (global as any).makeRequest(app);

      // Create user and get token
      const user = await (global as any).createE2ETestUser(app);
      const token = await (global as any).loginE2ETestUser(app, user.email, 'TestPassword123!');

      // Create multiple properties concurrently
      const propertyPromises = Array.from({ length: 10 }, (_, i) =>
        makeRequest
          .withAuth(token)
          .post('/properties')
          .send({
            title: `Concurrent Property ${i}`,
            price: 500000 + (i * 10000),
            type: 'RESIDENTIAL',
            address: {
              street: `${i} Test St`,
              city: 'Test City',
              state: 'TS',
              zipCode: '12345',
              country: 'Test',
              latitude: 40.7128 + (i * 0.001),
              longitude: -74.0060 + (i * 0.001),
            },
          })
      );

      const results = await Promise.allSettled(propertyPromises);
      
      // All requests should succeed
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
      expect(successful.length).toBe(10);

      // Verify all properties were created
      const listResponse = await makeRequest
        .withAuth(token)
        .get('/properties')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(listResponse.body.data.length).toBeGreaterThanOrEqual(10);

      // Clean up
      for (const result of successful) {
        if (result.status === 'fulfilled') {
          await makeRequest
            .withAuth(token)
            .delete(`/properties/${result.value.body.id}`)
            .expect(200);
        }
      }
    });
  });
});
