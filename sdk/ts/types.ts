/**
 * 龙族通用客户端 SDK 类型定义
 */

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  err_code?: string;
  data?: T;
}

export interface UploadSnapshotRequest<T = any> {
  appId: string;
  userHash: string;
  syncToken?: string;
  kouling?: string;
  nickname?: string;
  clientVersion?: string;
  snapshotAt?: string;
  localVersion: number;
  force?: boolean;
  payload: T;
}

export interface UploadSnapshotResult {
  serverVersion: number;
  savedAt?: string;
  conflict?: boolean;
  serverSnapshotAt?: string;
}

export interface DownloadSnapshotRequest {
  appId: string;
  userHash: string;
  syncToken?: string;
  kouling?: string;
}

export interface DownloadSnapshotResult<T = any> {
  appId: string;
  userHash: string;
  nickname?: string;
  serverVersion: number;
  snapshotAt: string;
  payload: T;
}

export interface SnapshotMetaRequest {
  appId: string;
  userHash: string;
}

export interface SnapshotMetaResult {
  serverVersion: number;
  snapshotAt: string;
  size: number;
}

export interface SubmitScoreRequest {
  appId: string;
  boardId: string;
  period?: 'all' | 'daily' | 'weekly';
  userHash: string;
  syncToken?: string;
  kouling?: string;
  nickname: string;
  score: number;
  stars?: number;
  sortOrder?: 'desc' | 'asc';
  extraData?: string;
}

export interface SubmitScoreResult {
  rank: number;
  score: number;
  improved: boolean;
}

export interface QueryRankRequest {
  appId: string;
  boardId?: string;
  period?: 'all' | 'daily' | 'weekly';
  limit?: number;
  userHash?: string;
  sortOrder?: 'desc' | 'asc';
}

export interface RankItem {
  rank: number;
  userHash: string;
  nickname: string;
  score: number;
  stars?: number;
  publishTime: number;
  extraData?: string;
}

export interface QueryRankResult {
  list: RankItem[];
  userRank?: {
    rank: number;
    score: number;
    stars?: number;
  };
  totalCount: number;
}
