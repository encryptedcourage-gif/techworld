import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

/**
 * Send a push notification via Expo's push service. The notification body is
 * generic ("New message") — never the message content, which is encrypted and
 * which the server cannot read anyway.
 */
export async function sendPush(
  pushToken: string | null,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  if (!pushToken || !Expo.isExpoPushToken(pushToken)) return;

  const message: ExpoPushMessage = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
  };

  try {
    await expo.sendPushNotificationsAsync([message]);
  } catch (err) {
    console.warn('[push] send failed', err);
  }
}
