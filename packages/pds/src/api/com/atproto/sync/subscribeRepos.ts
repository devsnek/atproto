import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import AppContext from '../../../../context'
import Outbox from '../../../../sequencer/outbox'
import { httpLogger } from '../../../../logger'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.sync.subscribeRepos(async function* ({ params, signal }) {
    const { cursor } = params
    const outbox = new Outbox(ctx.sequencer, {
      maxBufferSize: ctx.cfg.maxSubscriptionBuffer,
    })
    httpLogger.info({ cursor }, 'request to com.atproto.sync.subscribeRepos')

    const backfillTime = new Date(
      Date.now() - ctx.cfg.repoBackfillLimitMs,
    ).toISOString()
    if (cursor !== undefined) {
      const [next, curr] = await Promise.all([
        ctx.sequencer.next(cursor),
        ctx.sequencer.curr(),
      ])
      if (next && next.sequencedAt < backfillTime) {
        yield {
          $type: '#info',
          name: 'OutdatedCursor',
          message: 'Requested cursor exceeded limit. Possibly missing events',
        }
      }
      if (cursor > (curr?.seq ?? 0)) {
        throw new InvalidRequestError('Cursor in the future.', 'FutureCursor')
      }
    }

    for await (const evt of outbox.events(cursor, backfillTime, signal)) {
      if (evt.type === 'commit') {
        yield {
          $type: '#commit',
          seq: evt.seq,
          time: evt.time,
          ...evt.evt,
        }
      } else if (evt.type === 'handle') {
        yield {
          $type: '#handle',
          seq: evt.seq,
          time: evt.time,
          ...evt.evt,
        }
      } else if (evt.type === 'tombstone') {
        yield {
          $type: '#tombstone',
          seq: evt.seq,
          time: evt.time,
          ...evt.evt,
        }
      }
    }
  })
}
