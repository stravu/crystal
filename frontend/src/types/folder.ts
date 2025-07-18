export interface Folder {
  id: string;
  name: string;
  projectId: number;
  parentFolderId?: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  children?: Folder[]; // For tree representation
}

export interface CreateFolderRequest {
  name: string;
  projectId: number;
  parentFolderId?: string | null;
}

export interface UpdateFolderRequest {
  name?: string;
  displayOrder?: number;
  parentFolderId?: string | null;
}