export type FileEntry = {
  id: string;
  name: string;
  size: number;
  mime: string;
  uploadedAt: number;
};

export type PasteSessionMeta = {
  publicId: string;
  words: [string, string, string];
  expiresAt: number;
  createdAt: number;
};
