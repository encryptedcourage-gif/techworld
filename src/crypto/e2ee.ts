import nacl from 'tweetnacl';
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';

/**
 * End-to-end encryption primitives.
 *
 * Each device owns a Curve25519 key pair. The private key never leaves the
 * device (stored in the OS keychain/keystore via expo-secure-store). Messages
 * are sealed with NaCl box (X25519 + XSalsa20-Poly1305): authenticated
 * encryption between two key pairs. The server only ever relays ciphertext,
 * so the app owner — and anyone who compromises the server — cannot read
 * message content. This is the same category of guarantee WhatsApp/Signal give.
 */

const PRIVATE_KEY_STORE = 'e2ee.privateKey';
const PUBLIC_KEY_STORE = 'e2ee.publicKey';

export interface KeyPair {
  publicKey: string; // base64
  secretKey: string; // base64
}

export interface SealedMessage {
  ciphertext: string; // base64
  nonce: string; // base64
}

/** Create a fresh identity key pair and persist it securely on-device. */
export async function generateIdentity(): Promise<KeyPair> {
  const pair = nacl.box.keyPair();
  const keyPair: KeyPair = {
    publicKey: encodeBase64(pair.publicKey),
    secretKey: encodeBase64(pair.secretKey),
  };
  await SecureStore.setItemAsync(PRIVATE_KEY_STORE, keyPair.secretKey);
  await SecureStore.setItemAsync(PUBLIC_KEY_STORE, keyPair.publicKey);
  return keyPair;
}

/** Load the device identity, creating one on first launch. */
export async function loadOrCreateIdentity(): Promise<KeyPair> {
  const secretKey = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
  const publicKey = await SecureStore.getItemAsync(PUBLIC_KEY_STORE);
  if (secretKey && publicKey) {
    return { secretKey, publicKey };
  }
  return generateIdentity();
}

/** Encrypt `plaintext` for the holder of `recipientPublicKey`. */
export function seal(
  plaintext: string,
  recipientPublicKey: string,
  senderSecretKey: string
): SealedMessage {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(
    decodeUTF8(plaintext),
    nonce,
    decodeBase64(recipientPublicKey),
    decodeBase64(senderSecretKey)
  );
  return { ciphertext: encodeBase64(box), nonce: encodeBase64(nonce) };
}

/** Decrypt a message sealed by the holder of `senderPublicKey`. */
export function open(
  message: SealedMessage,
  senderPublicKey: string,
  recipientSecretKey: string
): string | null {
  const opened = nacl.box.open(
    decodeBase64(message.ciphertext),
    decodeBase64(message.nonce),
    decodeBase64(senderPublicKey),
    decodeBase64(recipientSecretKey)
  );
  if (!opened) return null;
  return encodeUTF8(opened);
}
