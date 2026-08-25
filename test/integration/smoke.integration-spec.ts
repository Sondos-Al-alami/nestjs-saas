import { createGatewayClient } from './gateway-client';

/**
 * Minimal smoke test so Jest integration config is verifiable before the
 * full register → login → course flow (todos 7–8) lands.
 */
describe('integration smoke', () => {
  const api = createGatewayClient();

  it('GET /internal/downstream-health returns 200 with authOrg, course, analytics', async () => {
    const res = await api.get('/internal/downstream-health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        authOrg: expect.anything(),
        course: expect.anything(),
        analytics: expect.anything(),
      }),
    );
  });

  it('GET / returns 200', async () => {
    const res = await api.get('/');
    expect(res.status).toBe(200);
  });
});
