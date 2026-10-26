import crypto from 'crypto';

/**
 * Safe Bounds & Arithmetic Checker (Prevents Integer Overflows)
 */
export class SafeMath {
    /**
     * Checks if addition would overflow standard JS Safe Integer or exceed a given limit.
     */
    static checkAdditionOverflow(a: number, b: number, maxLimit: number): boolean {
        if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(maxLimit)) {
            return false;
        }
        if (a < 0 || b < 0 || maxLimit < 0) {
            return false;
        }
        // Check for JS addition overflow
        const sum = a + b;
        if (!Number.isSafeInteger(sum)) {
            return false;
        }
        // Check boundary limit check
        if (sum > maxLimit) {
            return false;
        }
        return true;
    }
}

export interface FileIndexEntry {
    filePath: string;
    categoryTag: string;
    byteOffset: number; // Offset from the start of the payload region
    fileSize: number;   // Size of the encrypted file segment
    iv: string;         // Hex-encoded initialization vector for this file
    tag: string;        // Hex-encoded AEAD tag for this file
}

/**
 * Vault Indexer & Container Module (Encrypted Manifest + File Blobs)
 * Encrypts a structured index at the header level using AES-256-GCM.
 * Supports selective extraction of individual sub-files.
 */
export class VaultIndexer {
    // Magic header bytes for Cipher-Tube Vault: ".ctvlt"
    static readonly MAGIC = Buffer.from('.ctvlt');
    static readonly MAX_VAULT_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB cap limit

    /**
     * Packs multiple files into an encrypted binary vault container.
     */
    static pack(
        files: Array<{ filePath: string; categoryTag: string; content: Buffer }>,
        masterKey: Buffer
    ): Buffer {
        if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
            throw new Error('Invalid masterKey: Must be a 32-byte Buffer.');
        }

        const manifest: FileIndexEntry[] = [];
        const payloadBuffers: Buffer[] = [];
        let currentOffset = 0;

        for (const file of files) {
            if (!file.filePath || !file.categoryTag || !Buffer.isBuffer(file.content)) {
                throw new Error('Invalid input file parameters.');
            }

            // Check math security for size bounds
            if (!SafeMath.checkAdditionOverflow(currentOffset, file.content.length, this.MAX_VAULT_SIZE)) {
                throw new Error('Size overflow or vault limit exceeded.');
            }

            // Encrypt each file individually using AES-256-GCM
            const fileIv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, fileIv);
            const encryptedContent = Buffer.concat([cipher.update(file.content), cipher.final()]);
            const fileTag = cipher.getAuthTag();

            // Store entry detail
            manifest.push({
                filePath: file.filePath,
                categoryTag: file.categoryTag,
                byteOffset: currentOffset,
                fileSize: encryptedContent.length,
                iv: fileIv.toString('hex'),
                tag: fileTag.toString('hex')
            });

            payloadBuffers.push(encryptedContent);
            currentOffset += encryptedContent.length;
        }

        // Encrypt the manifest index JSON string using AES-256-GCM
        const manifestStr = JSON.stringify(manifest);
        const manifestBuf = Buffer.from(manifestStr, 'utf8');

        const indexIv = crypto.randomBytes(12);
        const indexCipher = crypto.createCipheriv('aes-256-gcm', masterKey, indexIv);
        const encryptedIndex = Buffer.concat([indexCipher.update(manifestBuf), indexCipher.final()]);
        const indexTag = indexCipher.getAuthTag();

        // Binary Layout:
        // MAGIC (6 bytes)
        // Index IV (12 bytes)
        // Index Tag (16 bytes)
        // Index Length (4 bytes, UInt32BE)
        // Encrypted Index
        // File Payloads Region
        const headerLen = this.MAGIC.length + 12 + 16 + 4;
        const totalBufferLength = headerLen + encryptedIndex.length + currentOffset;

        if (!Number.isSafeInteger(totalBufferLength) || totalBufferLength > this.MAX_VAULT_SIZE) {
            throw new Error('Vault size limit exceeded.');
        }

        const vaultBuffer = Buffer.allocUnsafe(totalBufferLength);
        let writeOffset = 0;

        // 1. Magic
        vaultBuffer.set(this.MAGIC, writeOffset);
        writeOffset += this.MAGIC.length;

        // 2. Index IV
        vaultBuffer.set(indexIv, writeOffset);
        writeOffset += 12;

        // 3. Index Tag
        vaultBuffer.set(indexTag, writeOffset);
        writeOffset += 16;

        // 4. Index Length
        vaultBuffer.writeUInt32BE(encryptedIndex.length, writeOffset);
        writeOffset += 4;

        // 5. Encrypted Index Payload
        vaultBuffer.set(encryptedIndex, writeOffset);
        writeOffset += encryptedIndex.length;

        // 6. File Payloads Region
        for (const pBuf of payloadBuffers) {
            vaultBuffer.set(pBuf, writeOffset);
            writeOffset += pBuf.length;
        }

        return vaultBuffer;
    }

    /**
     * Selectively extracts and decrypts a single file from the vault buffer without unpacking the whole vault.
     */
    static selectiveUnpack(
        vaultBuffer: Buffer,
        filePath: string,
        masterKey: Buffer
    ): Buffer {
        if (!Buffer.isBuffer(vaultBuffer)) {
            throw new Error('Input must be a Buffer.');
        }
        if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
            throw new Error('Invalid masterKey: Must be a 32-byte Buffer.');
        }

        const headerLen = this.MAGIC.length + 12 + 16 + 4;
        if (vaultBuffer.length < headerLen) {
            throw new Error('Invalid vault format: Buffer too short.');
        }

        // 1. Verify Magic
        const magic = vaultBuffer.subarray(0, this.MAGIC.length);
        if (!magic.equals(this.MAGIC)) {
            throw new Error('Invalid vault format: Magic signature mismatch.');
        }

        let readOffset = this.MAGIC.length;

        // 2. Extract Index IV
        const indexIv = vaultBuffer.subarray(readOffset, readOffset + 12);
        readOffset += 12;

        // 3. Extract Index Tag
        const indexTag = vaultBuffer.subarray(readOffset, readOffset + 16);
        readOffset += 16;

        // 4. Extract Index Length
        const indexLength = vaultBuffer.readUInt32BE(readOffset);
        readOffset += 4;

        if (vaultBuffer.length < headerLen + indexLength) {
            throw new Error('Invalid vault format: Truncated index.');
        }

        // 5. Extract and Decrypt Manifest Index
        const encryptedIndex = vaultBuffer.subarray(readOffset, readOffset + indexLength);
        const payloadRegionStartOffset = readOffset + indexLength;

        let decryptedIndexStr: string;
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, indexIv);
            decipher.setAuthTag(indexTag);
            const decryptedIndexBuf = Buffer.concat([decipher.update(encryptedIndex), decipher.final()]);
            decryptedIndexStr = decryptedIndexBuf.toString('utf8');
        } catch (err: any) {
            throw new Error(`Integrity verification failed for index: ${err.message}`);
        }

        let manifest: FileIndexEntry[];
        try {
            manifest = JSON.parse(decryptedIndexStr);
        } catch {
            throw new Error('Invalid vault index structure: JSON parse error.');
        }

        // Sentinel: Verify decrypted manifest is a valid array of non-null objects to prevent type confusion / DoS
        if (!Array.isArray(manifest)) {
            throw new Error('Invalid vault index structure: Manifest must be an array.');
        }

        // 6. Search for target file path in manifest
        const entry = manifest.find((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return false;
            }
            return item.filePath === filePath;
        });
        if (!entry) {
            throw new Error(`File not found in vault manifest: ${filePath}`);
        }

        // Sentinel: Strictly validate the found entry properties to prevent type confusion, DoS, and unhandled exceptions
        if (
            typeof entry.filePath !== 'string' ||
            typeof entry.categoryTag !== 'string' ||
            typeof entry.iv !== 'string' ||
            typeof entry.tag !== 'string' ||
            typeof entry.byteOffset !== 'number' ||
            typeof entry.fileSize !== 'number' ||
            !Number.isSafeInteger(entry.byteOffset) ||
            !Number.isSafeInteger(entry.fileSize) ||
            entry.byteOffset < 0 ||
            entry.fileSize < 0
        ) {
            throw new Error('Invalid entry structure in vault manifest.');
        }

        // Sentinel: Ensure addition of offsets does not overflow
        if (!SafeMath.checkAdditionOverflow(payloadRegionStartOffset, entry.byteOffset, this.MAX_VAULT_SIZE)) {
            throw new Error('Invalid vault format: Offset overflow.');
        }
        // 7. Selective extraction and decryption
        const fileStartOffset = payloadRegionStartOffset + entry.byteOffset;

        if (!SafeMath.checkAdditionOverflow(fileStartOffset, entry.fileSize, this.MAX_VAULT_SIZE)) {
            throw new Error('Invalid vault format: Size overflow.');
        }
        const fileEndOffset = fileStartOffset + entry.fileSize;

        if (vaultBuffer.length < fileEndOffset) {
            throw new Error('Invalid vault format: Payload region truncated.');
        }

        const encryptedFilePayload = vaultBuffer.subarray(fileStartOffset, fileEndOffset);
        const fileIvBuf = Buffer.from(entry.iv, 'hex');
        const fileTagBuf = Buffer.from(entry.tag, 'hex');

        try {
            const fileDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, fileIvBuf);
            fileDecipher.setAuthTag(fileTagBuf);
            return Buffer.concat([fileDecipher.update(encryptedFilePayload), fileDecipher.final()]);
        } catch (err: any) {
            throw new Error(`Selective decryption failed for file ${filePath}: ${err.message}`);
        }
    }
}
