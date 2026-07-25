import type { MessageDatabase } from './database';
import type { MessageRecord } from './message';

/**
 * Delivery record from the database.
 */
export interface DeliveryRecord {
  id?: number;
  message_id?: number;
  status?: string;
  code?: number;
  output?: string;
  details?: string;
  sent_with_ssl?: boolean;
  log_id?: string;
  timestamp?: number;
  time?: number;
}

/**
 * Webhook event mapping by delivery status.
 */
const DELIVERY_WEBHOOK_EVENTS: Record<string, string> = {
  Sent: 'MessageSent',
  SoftFail: 'MessageDelayed',
  HardFail: 'MessageDeliveryFailed',
  Held: 'MessageHeld',
};

/**
 * Delivery management — mirrors Ruby Delivery class.
 */
export class DeliveryStore {
  private db: MessageDatabase;

  constructor(db: MessageDatabase) {
    this.db = db;
  }

  /**
   * Create a delivery attempt for a message.
   */
  create(
    message: MessageRecord,
    status: string,
    options: Partial<DeliveryRecord> = {},
  ): DeliveryRecord {
    const attributes: Record<string, unknown> = {
      message_id: message.id,
      status,
      timestamp: Date.now() / 1000,
      ...options,
    };

    // Truncate output/details to 250 chars to avoid column overflow
    if (typeof attributes.output === 'string') {
      attributes.output = attributes.output.slice(0, 250);
    }
    if (typeof attributes.details === 'string') {
      attributes.details = attributes.details.slice(0, 250);
    }

    const id = this.db.insert('deliveries', attributes);

    const delivery: DeliveryRecord = { ...attributes, id };

    // Update message status
    const holdExpiry = status === 'Held'
      ? Date.now() / 1000 + (7 * 86400) // default_maximum_hold_expiry_days = 7
      : null;

    this.db.update('messages', {
      status,
      last_delivery_attempt: delivery.timestamp,
      held: status === 'Held' ? 1 : 0,
      hold_expiry: holdExpiry,
    }, { where: { id: message.id! } });

    return delivery;
  }

  /**
   * Get all deliveries for a message.
   */
  forMessage(messageId: number): DeliveryRecord[] {
    const result = this.db.select<DeliveryRecord>('deliveries', {
      where: { message_id: messageId },
      order: 'timestamp',
    });
    return Array.isArray(result) ? result : [];
  }

  /**
   * Get the webhook event name for a delivery status.
   */
  getWebhookEvent(status: string): string | undefined {
    return DELIVERY_WEBHOOK_EVENTS[status];
  }
}
