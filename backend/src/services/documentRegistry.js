import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function documentChecksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function createDocumentRegistry({ path: registryPath }) {
  let cache;
  async function load() {
    if (cache) return cache;
    try { cache = JSON.parse(await readFile(registryPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; cache = { documents: [] }; }
    return cache;
  }
  async function save() {
    await mkdir(path.dirname(registryPath), { recursive: true });
    await writeFile(registryPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  }
  return {
    async list(target) { const state = await load(); return state.documents.filter((doc) => !target || doc.target === target); },
    async findByChecksum(checksum, target) { return (await this.list(target)).find((doc) => doc.checksum === checksum); },
    async add(document) { const state = await load(); state.documents.push(document); await save(); return document; },
    async update(id, patch) { const state = await load(); const doc = state.documents.find((item) => item.id === id); if (!doc) return null; Object.assign(doc, patch); await save(); return doc; }
  };
}

export async function persistUpload({ buffer, uploadDir, filename }) {
  const targetDir = path.resolve(uploadDir);
  await mkdir(targetDir, { recursive: true });
  const target = path.join(targetDir, filename);
  await writeFile(target, buffer);
  return target;
}
