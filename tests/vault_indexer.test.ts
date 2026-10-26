import crypto from 'crypto';
import { VaultIndexer, SafeMath } from '../src/crypto/VaultIndexer';

describe('SafeMath & Input Sanitization Guards', () => {
    const MAX_LIMIT = 100 * 1024 * 1024 * 1024; // 100 GB

    it('should correctly validate safe additions within boundaries', () => {
        expect(SafeMath.checkAdditionOverflow(1024, 2048, MAX_LIMIT)).toBe(true);
        expect(SafeMath.checkAdditionOverflow(0, 0, MAX_LIMIT)).toBe(true);
        expect(SafeMath.checkAdditionOverflow(MAX_LIMIT - 5, 5, MAX_LIMIT)).toBe(true);
    });

    it('should deny additions exceeding the boundary limit', () => {
        expect(SafeMath.checkAdditionOverflow(MAX_LIMIT - 5, 6, MAX_LIMIT)).toBe(false);
        expect(SafeMath.checkAdditionOverflow(MAX_LIMIT, 1, MAX_LIMIT)).toBe(false);
    });

    it('should deny inputs that are not safe integers or negative numbers', () => {
        expect(SafeMath.checkAdditionOverflow(-5, 10, MAX_LIMIT)).toBe(false);
        expect(SafeMath.checkAdditionOverflow(10, -5, MAX_LIMIT)).toBe(false);
        expect(SafeMath.checkAdditionOverflow(1.5, 10, MAX_LIMIT)).toBe(false);
        expect(SafeMath.checkAdditionOverflow(Number.MAX_SAFE_INTEGER, 1, MAX_LIMIT)).toBe(false);
    });
});

describe('Encrypted Vault Indexer (vault_core)', () => {
    const masterKey = crypto.randomBytes(32);
    const files = [
        {
            filePath: 'config/session_keys.dat',
            categoryTag: 'security',
            content: Buffer.from('SECURE_SESSION_KEY_FOR_CIPHER_TUBE')
        },
        {
            filePath: 'data/logs_archive.ctube',
            categoryTag: 'analytics',
            content: Buffer.from('ANALYTICS_LOGS_PAYLOAD_FOR_SENSORY_CHANNELS')
        }
    ];

    it('should successfully pack and selectively unpack individual files without unpacking all', () => {
        const vaultBuffer = VaultIndexer.pack(files, masterKey);
        expect(Buffer.isBuffer(vaultBuffer)).toBe(true);
        expect(vaultBuffer.length).toBeGreaterThan(0);

        // Selective unpack of file 1
        const decryptedFile1 = VaultIndexer.selectiveUnpack(vaultBuffer, 'config/session_keys.dat', masterKey);
        expect(decryptedFile1.toString('utf8')).toBe('SECURE_SESSION_KEY_FOR_CIPHER_TUBE');

        // Selective unpack of file 2
        const decryptedFile2 = VaultIndexer.selectiveUnpack(vaultBuffer, 'data/logs_archive.ctube', masterKey);
        expect(decryptedFile2.toString('utf8')).toBe('ANALYTICS_LOGS_PAYLOAD_FOR_SENSORY_CHANNELS');
    });

    it('should throw safe error when selective unpacking a non-existent file', () => {
        const vaultBuffer = VaultIndexer.pack(files, masterKey);
        expect(() => {
            VaultIndexer.selectiveUnpack(vaultBuffer, 'non-existent-path.txt', masterKey);
        }).toThrow('File not found in vault manifest: non-existent-path.txt');
    });

    it('should raise integrity verification error when vault buffer is tampered with', () => {
        const vaultBuffer = VaultIndexer.pack(files, masterKey);

        // Tamper magic bytes
        const tamperedMagic = Buffer.from(vaultBuffer);
        tamperedMagic[0] ^= 0xFF;
        expect(() => {
            VaultIndexer.selectiveUnpack(tamperedMagic, 'config/session_keys.dat', masterKey);
        }).toThrow('Invalid vault format: Magic signature mismatch.');

        // Tamper index tag
        const tamperedIndexTag = Buffer.from(vaultBuffer);
        // Header structure: MAGIC (6 bytes) + Index IV (12 bytes) + Index Tag (16 bytes) -> index tag is offset 18
        tamperedIndexTag[18] ^= 0xFF;
        expect(() => {
            VaultIndexer.selectiveUnpack(tamperedIndexTag, 'config/session_keys.dat', masterKey);
        }).toThrow(/Integrity verification failed/);

        // Tamper file payload content
        const tamperedPayload = Buffer.from(vaultBuffer);
        // Payload comes at the end, let's flip the very last byte of the vault
        tamperedPayload[tamperedPayload.length - 1] ^= 0xFF;
        expect(() => {
            VaultIndexer.selectiveUnpack(tamperedPayload, 'data/logs_archive.ctube', masterKey);
        }).toThrow(/Selective decryption failed/);
    });

    it('should reject invalid keys or parameters', () => {
        const badKey = crypto.randomBytes(16); // Invalid length (not 32)
        expect(() => {
            VaultIndexer.pack(files, badKey);
        }).toThrow('Invalid masterKey: Must be a 32-byte Buffer.');

        const vaultBuffer = VaultIndexer.pack(files, masterKey);
        expect(() => {
            VaultIndexer.selectiveUnpack(vaultBuffer, 'config/session_keys.dat', badKey);
        }).toThrow('Invalid masterKey: Must be a 32-byte Buffer.');

        expect(() => {
            VaultIndexer.selectiveUnpack('not-a-buffer' as any, 'config/session_keys.dat', masterKey);
        }).toThrow('Input must be a Buffer.');
    });

    it('should reject malformed manifest JSON when decrypted (type confusion prevention)', () => {
        const invalidManifestStr = JSON.stringify({ notAnArray: true });
        const manifestBuf = Buffer.from(invalidManifestStr, 'utf8');

        const indexIv = crypto.randomBytes(12);
        const indexCipher = crypto.createCipheriv('aes-256-gcm', masterKey, indexIv);
        const encryptedIndex = Buffer.concat([indexCipher.update(manifestBuf), indexCipher.final()]);
        const indexTag = indexCipher.getAuthTag();

        const totalBufferLength = VaultIndexer.MAGIC.length + 12 + 16 + 4 + encryptedIndex.length;
        const vaultBuffer = Buffer.allocUnsafe(totalBufferLength);
        let writeOffset = 0;

        vaultBuffer.set(VaultIndexer.MAGIC, writeOffset);
        writeOffset += VaultIndexer.MAGIC.length;

        vaultBuffer.set(indexIv, writeOffset);
        writeOffset += 12;

        vaultBuffer.set(indexTag, writeOffset);
        writeOffset += 16;

        vaultBuffer.writeUInt32BE(encryptedIndex.length, writeOffset);
        writeOffset += 4;

        vaultBuffer.set(encryptedIndex, writeOffset);

        expect(() => {
            VaultIndexer.selectiveUnpack(vaultBuffer, 'config/session_keys.dat', masterKey);
        }).toThrow('Invalid vault index structure: Manifest must be an array.');
    });

    it('should reject manifest entry with malformed fields', () => {
        const invalidManifest = [
            {
                filePath: 'config/session_keys.dat',
                categoryTag: 'security',
                byteOffset: 'invalid-string-offset', // Should be a number
                fileSize: 10,
                iv: '1234567890abcdef12345678',
                tag: '1234567890abcdef1234567890abcdef'
            }
        ];
        const manifestBuf = Buffer.from(JSON.stringify(invalidManifest), 'utf8');

        const indexIv = crypto.randomBytes(12);
        const indexCipher = crypto.createCipheriv('aes-256-gcm', masterKey, indexIv);
        const encryptedIndex = Buffer.concat([indexCipher.update(manifestBuf), indexCipher.final()]);
        const indexTag = indexCipher.getAuthTag();

        const totalBufferLength = VaultIndexer.MAGIC.length + 12 + 16 + 4 + encryptedIndex.length + 10;
        const vaultBuffer = Buffer.allocUnsafe(totalBufferLength);
        let writeOffset = 0;

        vaultBuffer.set(VaultIndexer.MAGIC, writeOffset);
        writeOffset += VaultIndexer.MAGIC.length;

        vaultBuffer.set(indexIv, writeOffset);
        writeOffset += 12;

        vaultBuffer.set(indexTag, writeOffset);
        writeOffset += 16;

        vaultBuffer.writeUInt32BE(encryptedIndex.length, writeOffset);
        writeOffset += 4;

        vaultBuffer.set(encryptedIndex, writeOffset);

        expect(() => {
            VaultIndexer.selectiveUnpack(vaultBuffer, 'config/session_keys.dat', masterKey);
        }).toThrow('Invalid file entry structure in manifest.');
    });
});
