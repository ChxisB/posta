import { Elysia } from 'elysia';
import { SNSClient, ConfirmSubscriptionCommand } from '@aws-sdk/client-sns';
import { awsSettings, snsMessageSchema, verifySnsMessage } from '@posta/aws';
import { enqueueSesEvent } from '@posta/aws';

/** This public endpoint verifies SNS signatures before accepting any event. */
export const sesEventsRoutes = new Elysia()
  .post('/ses/events', async (c: any) => {
    let raw: unknown;
    try { raw = typeof c.body === 'string' ? JSON.parse(c.body) : c.body; }
    catch { c.set.status = 400; return { error: 'InvalidNotification' }; }
    const parsed = snsMessageSchema.safeParse(raw);
    if (!parsed.success) { c.set.status = 400; return { error: 'InvalidNotification' }; }
    const { getConfig, getDb } = await import('../index');
    const config = await getConfig();
    const message = parsed.data;
    if (!await verifySnsMessage(message, awsSettings(config).topicArns)) {
      c.set.status = 403; return { error: 'InvalidSnsSignature' };
    }
    if (message.Type === 'SubscriptionConfirmation') {
      if (!message.Token) { c.set.status = 400; return { error: 'MissingToken' }; }
      await new SNSClient({ region: message.TopicArn.split(':')[3] }).send(new ConfirmSubscriptionCommand({
        TopicArn: message.TopicArn, Token: message.Token,
      }));
      return { confirmed: true };
    }
    if (message.Type !== 'Notification') return { accepted: false };
    try {
      const payload = JSON.parse(message.Message);
      return { accepted: await enqueueSesEvent(await getDb(), message.TopicArn, message.MessageId, payload) };
    } catch (error: any) {
      c.set.status = error instanceof SyntaxError ? 400 : 503;
      return { error: 'EventNotAccepted' };
    }
  }, { parse: 'text' });
