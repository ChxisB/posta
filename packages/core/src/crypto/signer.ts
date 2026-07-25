/**
 * RSA SHA256 signer for webhook/auth headers.
 *
 * Mirrors the Ruby Posta::Signer class at lib/posta/signer.rb.
 * Signs data with RSA SHA256 and returns Base64-encoded signatures.
 */
export class Signer {
  private privateKey: string;

  constructor(privateKey: string) {
    // Private key in PEM format
    this.privateKey = privateKey;
  }

  /**
   * Sign data with RSA SHA256.
   */
  async sign(data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const key = await this.getPrivateKey();
    return await crypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: 32 },
      key,
      encoder.encode(data),
    );
  }

  /**
   * Sign data and return a Base64-encoded signature.
   */
  async sign64(data: string): Promise<string> {
    const sig = await this.sign(data);
    return bufferToBase64(sig);
  }

  /**
   * Sign data with SHA1 (legacy) and return a Base64-encoded signature.
   */
  async sha1Sign(data: string): Promise<Buffer> {
    // Node.js crypto for SHA1-RSA
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createSign('RSA-SHA1').update(data).sign(this.privateKey);
  }

  /**
   * Sign data with SHA1 and return a Base64-encoded string.
   */
  async sha1Sign64(data: string): Promise<string> {
    const sig = await this.sha1Sign(data);
    return Buffer.from(sig).toString('base64');
  }

  /**
   * Get a JWK representation of the public key.
   */
  async getJwk(): Promise<any> {
    const key = await this.getPublicKey();
    return await crypto.subtle.exportKey('jwk', key);
  }

  private cryptoKey: CryptoKey | null = null;

  private async getPrivateKey(): Promise<CryptoKey> {
    if (this.cryptoKey) return this.cryptoKey;

    const pem = this.privateKey;
    const pemHeader = '-----BEGIN RSA PRIVATE KEY-----';
    const pemFooter = '-----END RSA PRIVATE KEY-----';
    const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length);
    const binaryDer = Uint8Array.from(atob(pemContents.replace(/\s/g, '')), (c) => c.charCodeAt(0));

    this.cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['sign'],
    );
    return this.cryptoKey;
  }

  private async getPublicKey(): Promise<CryptoKey> {
    const privateKey = await this.getPrivateKey();
    return await crypto.subtle.importKey(
      'spki',
      await crypto.subtle.exportKey('spki', privateKey),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['verify'],
    );
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
