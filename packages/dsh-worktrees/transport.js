import { z } from 'zod';
import { RPC_ENDPOINTS } from './host.js';

/** Register exact authenticated routes on the existing Connection transport. */
export function registerTransport(ctx, host) {
  for (const endpoint of RPC_ENDPOINTS) {
    const method = `dsh-worktrees/${endpoint}`;
    const envelope = z.object({
      type: z.literal('client-request'),
      rpcId: z.string(),
      method: z.literal(method),
      payload: z.unknown(),
    });
    ctx.effect(() => ctx.connection.fetch.register({
      path: `/api/${method}`,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        const admission = ctx.connection.admit(request);
        if ('rejection' in admission) return new Response('unauthorized', { status: admission.rejection });
        if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return new Response('content type must be application/json', { status: 415 });
        let message;
        try { message = envelope.parse(await request.json()); }
        catch { return new Response('invalid worktree request envelope', { status: 400 }); }
        const result = await host.rpc(endpoint, message.payload, request.signal, admission.peer);
        return Response.json({ type: 'server-response', rpcId: message.rpcId, result });
      },
    }));
  }
}
