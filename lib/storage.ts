import { db } from "./supabase";

export const BUCKET = "materiais";

export type Material = {
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  url: string;
};

// Nome de arquivo previsível: sem acento, sem espaço, minúsculo.
// Uma URL com espaço vira %20 e quebra em vários leitores de link.
export function slugifyFilename(original: string): string {
  const dot = original.lastIndexOf(".");
  const base = dot > 0 ? original.slice(0, dot) : original;
  const ext = dot > 0 ? original.slice(dot).toLowerCase() : "";
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "material"}${ext}`;
}

export function publicUrl(name: string): string {
  return db().storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

export async function listMaterials(): Promise<Material[]> {
  const { data, error } = await db()
    .storage.from(BUCKET)
    .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(error.message);

  return (data || [])
    .filter((f) => f.id) // entradas sem id são pastas
    .map((f) => ({
      name: f.name,
      size: (f.metadata?.size as number) ?? 0,
      mime: (f.metadata?.mimetype as string) ?? "",
      createdAt: f.created_at ?? "",
      url: publicUrl(f.name),
    }));
}

export async function putMaterial(file: File): Promise<Material> {
  const name = slugifyFilename(file.name);
  const bytes = await file.arrayBuffer();
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(name, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true, // reenviar o mesmo nome substitui o arquivo
    });
  if (error) throw new Error(error.message);
  return { name, size: file.size, mime: file.type, createdAt: new Date().toISOString(), url: publicUrl(name) };
}

export async function removeMaterial(name: string): Promise<void> {
  const { error } = await db().storage.from(BUCKET).remove([name]);
  if (error) throw new Error(error.message);
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
