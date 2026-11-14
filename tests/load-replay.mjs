import fs from 'node:fs';
import { Agent, request } from 'node:http';
import { performance } from 'node:perf_hooks';

const [profile, ...waves] = process.argv.slice(2);
if (!profile || !waves.length) throw Error('Usage: node load-replay.mjs PROFILE.json 100 1000');
const base = 'http://127.0.0.1:8124';
const journeys = JSON.parse(fs.readFileSync(profile, 'utf8'));
for (const kind of ['desktop', 'mobile']) {
  if (!Array.isArray(journeys[kind]) || !journeys[kind].length) throw Error('Missing '+kind+' journey');
  for (const path of journeys[kind].flat()) {
    if (typeof path !== 'string' || !path.startsWith('/') || new URL(path,base).origin !== base) {
      throw Error('Non-local resource in the profile');
    }
  }
}

function download(agent, path) {
  return new Promise((resolve, reject) => {
    const req = request(base+path, {agent}, res => {
      let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; });
      res.once('error', reject);
      res.once('end', () => {
        if (res.statusCode !== 200 || !bytes || bytes !== Number(res.headers['content-length'] || bytes)) {
          reject(Error(path+' HTTP '+res.statusCode+' bytes='+bytes));
        } else resolve(bytes);
      });
    });
    req.setTimeout(15000, () => req.destroy(Error('timeout '+path)));
    req.once('error', reject);
    req.end();
  });
}

async function visit(agent, stages) {
  const start = performance.now();
  let bytes = 0, requests = 0, errors = 0, issue = '';
  for (const paths of stages) {
    for (let i = 0; i < paths.length; i += 6) {
      const replies = await Promise.allSettled(paths.slice(i,i+6).map(path => download(agent,path)));
      for (const reply of replies) {
        requests++;
        if (reply.status === 'fulfilled') bytes += reply.value;
        else {
          errors++;
          issue ||= reply.reason.message;
        }
      }
    }
  }
  return {seconds:(performance.now()-start)/1000,bytes,requests,errors,issue};
}

for (const wave of waves) {
  const users = Number(wave);
  if (!Number.isInteger(users) || users < 1 || users > 4000) throw Error('Use 1–4000 visitors');
  const agent = new Agent({keepAlive:true,maxSockets:1200,maxFreeSockets:1200});
  const start = performance.now();
  let reports;
  try {
    reports = await Promise.all(Array.from({length:users}, (_,i) => visit(agent,journeys[i%2?'desktop':'mobile'])));
  } finally {
    agent.destroy();
  }
  const latencies = reports.map(r=>r.seconds).sort((a,b)=>a-b);
  const errors = reports.reduce((n,r)=>n+r.errors,0);
  const result = {
    users, failed:reports.filter(r=>r.errors).length, errors,
    requests:reports.reduce((n,r)=>n+r.requests,0), bytes:reports.reduce((n,r)=>n+r.bytes,0),
    seconds:(performance.now()-start)/1000, p50:latencies[Math.ceil(users*0.5)-1],
    p95:latencies[Math.ceil(users*0.95)-1], max:latencies.at(-1),
    issue:reports.find(r=>r.issue)?.issue, driverRssMB:Math.round(process.memoryUsage().rss/1e6)
  };
  console.log(JSON.stringify(result));
  if (errors) process.exitCode=1;
}
