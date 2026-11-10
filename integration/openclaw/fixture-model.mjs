// A deterministic protocol fixture, NOT an LLM or external provider.
import { createServer } from 'node:http';
export async function startFixtureModel() {
  let callSequence = 0, callId, requestedTool, issued = false, observed = [], requests = 0;
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404); res.end(); return; }
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1000000) throw Error('fixture input bound'); }
      const body = JSON.parse(raw); requests++;
      if (!requestedTool || requests > 10) throw Error('unexpected fixture request');
      const toolResults = body.messages.filter(m => m.role === 'tool' && m.tool_call_id === callId);
      observed.push(...toolResults.map(m => m.content));
      if (issued && toolResults.length === 0) console.log('FIXTURE_CORRELATION', JSON.stringify({ expected: callId, received: body.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id) }));
      const call = !issued; issued = true;
      if (call && !body.tools?.some(t => t.function?.name === requestedTool)) throw Error('required tool absent from host catalog');
      const message = call ? { role: 'assistant', content: null, tool_calls: [{
        id: callId, type: 'function', function: { name: requestedTool, arguments: '{}' },
      }] } : { role: 'assistant', content: 'Synthetic fixture complete.' };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, ...message.tool_calls[0] }] } : message;
        for (const choices of [[{ index: 0, delta, finish_reason: null }],
          [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }]]) {
          res.write('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk',
            created: 1, model: 'fixture', choices }) + '\n\n');
        }
        res.end('data: [DONE]\n\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture',
          choices: [{ index: 0, message, finish_reason: call ? 'tool_calls' : 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
      }
    } catch { res.writeHead(500); res.end('Synthetic protocol fixture failed'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1',
    select(tool) { callId = 'alfredfixture' + (++callSequence); requestedTool = tool; issued = false; observed = []; requests = 0; },
    results() { return observed; },
    async close() { server.closeAllConnections(); await new Promise(r => server.close(r)); },
  };
}
