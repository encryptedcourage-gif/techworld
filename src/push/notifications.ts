import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from '@/api/client';

/**
 * Register this device for push notifications and send the Expo push token to
 * the backend so it can notify the user of new messages while the app is
 * closed. Safe to call when not logged in — it just skips the server update.
 */
export async function registerForPush(loggedIn: boolean): Promise<void> {
  if (!Device.isDevice) return; // Push doesn't work on simulators.

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return;

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
    if (loggedIn && token) {
      await api.put('/users/me/push-token', { pushToken: token }).catch(
        () => undefined
      );
    }
  } catch {
    // Non-fatal — messaging still works via the live socket / pending fetch.
  }
}
