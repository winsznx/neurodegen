import { realtimeService } from '@/lib/services/realtimeService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const cleanup = realtimeService.addClient(writer);

  writer.write(
    encoder.encode(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`)
  ).catch(() => { /* client disconnected during initial write */ });

  const closeHandler = () => {
    cleanup();
    writer.close().catch(() => { /* already closed */ });
  };

  readable.pipeTo(new WritableStream()).catch(closeHandler);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
