import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

export async function verifyDNS(domain: string): Promise<boolean> {
    try {
        const addresses = await resolve4(domain);
        return addresses.length > 0;
    } catch (error: any) {
        if (error.code === 'ENOTFOUND') {
            return false;
        }
        // If other error (timeout, etc), we might want to retry or assume false
        // For now, strict mode: if we can't resolve, it's not valid.
        return false;
    }
}
