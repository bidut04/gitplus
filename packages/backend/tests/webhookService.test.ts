import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { MemoryStore } from '../src/store/index';
import { WebhookService } from '../src/services/webhookService';
import { NotificationService } from '../src/services/notificationService';

describe('Webhook Service & Deduplication (T-WHK-*)', () => {
  let store: MemoryStore;
  let notifService: NotificationService;
  let webhookService: WebhookService;
  const secret = 'super-secret-key-123';

  beforeEach(() => {
    store = new MemoryStore();
    notifService = new NotificationService(store);
    webhookService = new WebhookService(store, notifService, secret);
  });

  function sign(payload: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(payload).digest('hex')}`;
  }

  it('T-WHK-001: successfully verifies valid HMAC SHA-256 signature', () => {
    const body = JSON.stringify({ action: 'push' });
    const signature = sign(body);
    expect(webhookService.verifySignature(body, signature)).toBe(true);
  });

  it('T-WHK-002: rejects tampered or malicious webhook bodies', () => {
    const body = JSON.stringify({ action: 'push' });
    const signature = sign(body);
    const tampered = JSON.stringify({ action: 'push', malicious: true });
    expect(webhookService.verifySignature(tampered, signature)).toBe(false);
  });

  it('T-WHK-003: deduplicates duplicate deliveries matching deliveryId', async () => {
    const deliveryId = 'deliv-uuid-unique-123';
    const payload = {
      ref: 'refs/heads/main',
      repository: {
        id: 991,
        name: 'core-backend',
        full_name: 'acme/core-backend',
        default_branch: 'main',
        private: true
      },
      commits: [{ id: 'c1', message: 'feat: add auth' }],
      sender: { login: 'dev_user' }
    };

    const first = await webhookService.handlePushEvent(deliveryId, payload);
    expect(first.status).toBe('PROCESSED');
    expect(store.events.size).toBe(1);

    const second = await webhookService.handlePushEvent(deliveryId, payload);
    expect(second.status).toBe('DUPLICATE');
    expect(store.events.size).toBe(1); // No new event created!
  });
});

