import request from 'supertest';
import { app, sessionCache } from '../src/server';
import { createClient } from 'redis';

jest.mock('redis', () => {
  const mRedis = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(null),
    get: jest.fn(),
    expire: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue('OK'),
  };
  return {
    createClient: jest.fn(() => mRedis),
  };
});

describe('Cache Penetration Vulnerability', () => {
  let redisMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionCache.clear();
    const { createClient } = require('redis');
    redisMock = createClient();
  });

  it('should implement negative caching for non-existent sessions', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440099';
    const userId = 'test-user';

    // Redis returns null (session not found)
    redisMock.get.mockResolvedValue(null);

    // First call
    const res1 = await request(app)
      .get(`/mcp/${sessionId}/check`)
      .set('x-user-id', userId);
    expect(res1.status).toBe(404);

    // Second call with same sessionId
    const res2 = await request(app)
      .get(`/mcp/${sessionId}/check`)
      .set('x-user-id', userId);
    expect(res2.status).toBe(404);

    // If negative caching is implemented, Redis should only be called once
    expect(redisMock.get).toHaveBeenCalledTimes(1);
    expect(redisMock.get).toHaveBeenCalledWith(`session:${sessionId}:owner`);
  });
});
