import type {
  ApiResponse,
  UploadSnapshotRequest,
  UploadSnapshotResult,
  DownloadSnapshotRequest,
  DownloadSnapshotResult,
  SnapshotMetaRequest,
  SnapshotMetaResult
} from './types';
import { LoongIdentity } from './LoongIdentity';

export class LoongSyncClient {
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://api.loongclan.xyz') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * 上传数据快照（Obsidian 范式）
   */
  async uploadSnapshot<T = any>(
    req: UploadSnapshotRequest<T>
  ): Promise<ApiResponse<UploadSnapshotResult>> {
    // 客户端鉴权与派生保护：口令绝不离机，只传散列密文
    let userHash = req.userHash;
    let syncToken = req.syncToken;

    if (req.kouling) {
      if (!LoongIdentity.isValid(req.kouling)) {
        return { code: 400, err_code: 'kouling_format', message: '口令格式有误' };
      }
      const computedHash = LoongIdentity.deriveUserHash(req.kouling);
      if (userHash && computedHash !== userHash) {
        return { code: 400, err_code: 'hash_mismatch', message: 'UserHash 与口令不匹配' };
      }
      userHash = computedHash;
      if (!syncToken) {
        syncToken = LoongIdentity.deriveSyncToken(req.kouling);
      }
    }

    if (!userHash || !syncToken) {
      return { code: 400, err_code: 'auth_missing', message: '缺少 userHash 或 syncToken' };
    }

    // 剔除明文口令，严禁向服务端传输
    const { kouling: _discarded, ...safeReq } = req;

    const res = await fetch(`${this.baseUrl}/api/v1/sync/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...safeReq,
        userHash,
        syncToken,
        snapshotAt: req.snapshotAt || new Date().toISOString()
      })
    });

    return res.json();
  }

  /**
   * 下载数据快照
   */
  async downloadSnapshot<T = any>(
    req: DownloadSnapshotRequest
  ): Promise<ApiResponse<DownloadSnapshotResult<T>>> {
    let userHash = req.userHash;
    let syncToken = req.syncToken;

    if (req.kouling) {
      if (!LoongIdentity.isValid(req.kouling)) {
        return { code: 400, err_code: 'kouling_format', message: '口令格式有误' };
      }
      if (!userHash) userHash = LoongIdentity.deriveUserHash(req.kouling);
      if (!syncToken) syncToken = LoongIdentity.deriveSyncToken(req.kouling);
    }

    if (!userHash || !syncToken) {
      return { code: 400, err_code: 'auth_missing', message: '缺少 userHash 或 syncToken' };
    }

    // 剔除明文口令
    const { kouling: _discarded, ...safeReq } = req;

    const res = await fetch(`${this.baseUrl}/api/v1/sync/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...safeReq,
        userHash,
        syncToken
      })
    });

    return res.json();
  }

  /**
   * 查询快照元数据（版本号与大小，用于启动时快速比对是否需要同步）
   */
  async getSnapshotMeta(
    req: SnapshotMetaRequest
  ): Promise<ApiResponse<SnapshotMetaResult>> {
    const res = await fetch(`${this.baseUrl}/api/v1/sync/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });

    return res.json();
  }

  /**
   * 全量数据导出
   */
  async exportUserData(
    appId: string,
    koulingOrToken: string,
    providedUserHash?: string
  ): Promise<ApiResponse<any>> {
    let userHash = providedUserHash || '';
    let syncToken = koulingOrToken;

    if (LoongIdentity.isValid(koulingOrToken)) {
      userHash = LoongIdentity.deriveUserHash(koulingOrToken);
      syncToken = LoongIdentity.deriveSyncToken(koulingOrToken);
    }

    const res = await fetch(`${this.baseUrl}/api/v1/sync/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, userHash, syncToken })
    });
    return res.json();
  }

  /**
   * 彻底删除云端数据
   */
  async purgeUserData(
    appId: string,
    koulingOrToken: string,
    providedUserHash?: string
  ): Promise<ApiResponse<void>> {
    let userHash = providedUserHash || '';
    let syncToken = koulingOrToken;

    if (LoongIdentity.isValid(koulingOrToken)) {
      userHash = LoongIdentity.deriveUserHash(koulingOrToken);
      syncToken = LoongIdentity.deriveSyncToken(koulingOrToken);
    }

    const res = await fetch(`${this.baseUrl}/api/v1/sync/purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, userHash, syncToken, confirm: 'DELETE_ALL_MY_DATA' })
    });
    return res.json();
  }
}
