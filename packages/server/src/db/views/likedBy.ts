import { isLikedByParams, LikedByView } from '@adxp/microblog'
import { DataSource } from 'typeorm'
import { AdxRecord } from '../record'
import { LikeIndex } from '../records/like'
import { ProfileIndex } from '../records/profile'
import { UserDid } from '../user-dids'

export const likedBy =
  (db: DataSource) =>
  async (params: unknown): Promise<LikedByView.Response> => {
    if (!isLikedByParams(params)) {
      throw new Error('Invalid params for blueskyweb.xyz:LikedByView')
    }
    const { uri, limit, before } = params

    const builder = db
      .createQueryBuilder()
      .select([
        'user.did',
        'user.username',
        'profile.displayName',
        'record.indexedAt',
        'like.createdAt',
      ])
      .from(LikeIndex, 'like')
      .leftJoin(AdxRecord, 'record', 'like.uri = record.uri')
      .leftJoin(UserDid, 'user', 'like.creator = user.did')
      .leftJoin(ProfileIndex, 'profile', 'profile.creator = user.did')
      .where('like.subject = :uri', { uri })
      .orderBy('like.createdAt')

    if (before !== undefined) {
      builder.andWhere('like.createdAt < :before', { before })
    }
    if (limit !== undefined) {
      builder.limit(limit)
    }
    const res = await builder.getRawMany()

    const likedBy = res.map((row) => ({
      did: row.user_did,
      name: row.user_username,
      displayName: row.profile_displayName,
      createdAt: row.like_createdAt,
      indexedAt: row.record_indexedAt,
    }))

    return {
      uri,
      likedBy,
    }
  }

export default likedBy
