
import { PersistenceLayer } from '../persistence/PersistenceLayer';
import * as fs from 'fs';

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const persistence = new PersistenceLayer();
    const key = process.env.CTUBE_KEY;

    if (!key) {
        console.error('Critical Security Error: CTUBE_KEY environment variable is not set. Operation aborted.');
        process.exit(1);
    }

    switch (command) {
        case 'save':
            const state = { timestamp: Date.now(), data: args[1] || 'empty' };
            const buffer = persistence.save(state, key);
            fs.writeFileSync('workspace.ctube', buffer);
            console.log('Sovereign State Saved to workspace.ctube.');
            break;
        case 'load':
            if (fs.existsSync('workspace.ctube')) {
                const loadedBuffer = fs.readFileSync('workspace.ctube');
                const loadedState = persistence.verifyAndLoad(loadedBuffer, key);
                console.log('Sovereign State Loaded:', loadedState);
            } else {
                console.log('No workspace.ctube found.');
            }
            break;
        case 'inspect':
            console.log('Inspecting .ctube file...');
            if (fs.existsSync('workspace.ctube')) {
                const buffer = fs.readFileSync('workspace.ctube');
                console.log('Header:', buffer.slice(0, 6).toString());
                console.log('Signature (Hex):', buffer.slice(6, 38).toString('hex'));
            }
            break;
        case 'verify':
            console.log('Verifying integrity...');
            try {
                if (fs.existsSync('workspace.ctube')) {
                    const buffer = fs.readFileSync('workspace.ctube');
                    persistence.verifyAndLoad(buffer, key);
                    console.log('Integrity: 100% (VERIFIED)');
                }
            } catch (e) {
                console.error('Integrity check failed:', (e as Error).message);
            }
            break;
        default:
            console.log('ctube v1.0 - Sovereign CLI');
            console.log('Usage: ctube <command> [args]');
    }
}

main().catch(console.error);
