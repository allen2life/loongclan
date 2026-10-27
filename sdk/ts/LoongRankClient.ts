import type {
  ApiResponse,
  SubmitScoreRequest,
  SubmitScoreResult,
  QueryRankRequest,
  QueryRankResult
} from './types';
import { LoongIdentity } from './LoongIdentity';

export class LoongRankClient {
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://api.loongclan.xyz') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * 提交排行榜成绩
   */
  async submitScore(
    req: SubmitScoreRequest
  ): Promise<ApiResponse<SubmitScoreResult>> {
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

    const res = await fetch(`${this.baseUrl}/api/v1/rank/submit`, {
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
   * 查询排行榜（Top-N 及当前玩家排名）
   */
  async queryRank(
    req: QueryRankRequest
  ): Promise<ApiResponse<QueryRankResult>> {
    const params = new URLSearchParams();
    params.set('appId', req.appId);
    if (req.boardId) params.set('boardId', req.boardId);
    if (req.period) params.set('period', req.period);
    if (req.limit) params.set('limit', String(req.limit));
    if (req.userHash) params.set('userHash', req.userHash);

    const res = await fetch(`${this.baseUrl}/api/v1/rank/query?${params.toString()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    return res.json();
  }
}
