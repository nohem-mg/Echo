/** Vercel Blob: static token (local/CI) or OIDC + BLOB_STORE_ID on Vercel deployments. */
export function hasVercelBlobStorage(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return true;
  }

  return Boolean(process.env.VERCEL && process.env.BLOB_STORE_ID?.trim());
}

export function blobStorageMissingEnv(): string[] {
  if (!process.env.VERCEL || hasVercelBlobStorage()) {
    return [];
  }

  return ["BLOB_STORE_ID"];
}

type BlobPutExtras = {
  access: "private";
  allowOverwrite: false;
  contentType: string;
  token?: string;
};

export function blobPutOptions(contentType: string): BlobPutExtras {
  const options: BlobPutExtras = {
    access: "private",
    allowOverwrite: false,
    contentType,
  };

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    options.token = token;
  }

  return options;
}
