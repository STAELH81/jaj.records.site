import { randomUUID, createHash } from 'node:crypto';

export const CHUNK_SIZE = 1024 * 1024;
export const MAX_AUDIO_SIZE = 15 * CHUNK_SIZE;
export const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);
export const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control':'no-store' } });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function actor(deps) {
    const session = await deps.getUser();
    if (!session?.id) throw Object.assign(new Error('unauthorized'), {status:401});
    const user = await deps.liveUser(session.id);
    const values = user?.roles || user?.app_metadata?.roles || user?.appMetadata?.roles || [];
    const roles = Array.isArray(values) ? values.map(role => String(role).toLowerCase()) : [];
    if (!roles.includes('admin') && !roles.includes('artist')) throw Object.assign(new Error('forbidden'), {status:403});
    return { id:session.id, admin:roles.includes('admin') };
}

export const owns = (who, draft) => draft && !draft.deletedAt && (who.admin || who.id === draft.ownerId);
export const audioKey = id => `audio/${id}/manifest.json`;
const partKey = (id, part) => `audio/${id}/${part}`;

function audioMime(bytes) {
    if (bytes.subarray(0,3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WAVE') return 'audio/wav';
    if (bytes.subarray(0,4).toString() === 'OggS') return 'audio/ogg';
    return null;
}

export function createAudioHandler(deps) {
    return async (request, context) => {
        try {
            const url = new URL(request.url);
            const store = deps.getStore(context);
            if (['GET','HEAD'].includes(request.method)) {
                const id = url.searchParams.get('id');
                if (!validId(id)) return json({error:'not_found'},404);
                const asset = await store.get(audioKey(id), {type:'json'});
                if (!asset?.complete) return json({error:'not_found'},404);
                const draft = await store.get(`drafts/${asset.draftId}.json`, {type:'json'});
                if (!draft || draft.deletedAt || draft.retiredAudio?.includes(id)) return json({error:'not_found'},404);
                const published = draft?.publication?.tracks.some(track => track.audioAssetId === id);
                if (!published) {
                    const who = await actor(deps);
                    if (!owns(who,draft)) return json({error:'not_found'},404);
                }
                let start=0, end=asset.size-1;
                const range = request.headers.get('range');
                if (range) {
                    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                    if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${asset.size}`}});
                    if (!match[1]) start=Math.max(0,asset.size-Number(match[2]));
                    else { start=Number(match[1]); if(match[2]) end=Math.min(end,Number(match[2])); }
                    if (start>end || start>=asset.size) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${asset.size}`}});
                }
                let part=Math.floor(start/CHUNK_SIZE);
                const last=Math.floor(end/CHUNK_SIZE);
                const stream = request.method === 'HEAD' ? null : new ReadableStream({
                    async pull(controller) {
                        try {
                            if(part>last){controller.close();return;}
                            const current=part++;
                            const bytes=await store.get(partKey(id,current),{type:'arrayBuffer'});
                            if(!bytes) throw new Error('missing_chunk');
                            const from=Math.max(0,start-current*CHUNK_SIZE);
                            const to=Math.min(bytes.byteLength,end-current*CHUNK_SIZE+1);
                            controller.enqueue(new Uint8Array(bytes).subarray(from,to));
                        } catch(error){controller.error(error);}
                    },
                });
                const headers={'Content-Type':asset.mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
                if(range) headers['Content-Range']=`bytes ${start}-${end}/${asset.size}`;
                return new Response(request.method==='HEAD'?null:stream,{status:range?206:200,headers});
            }
            if (request.method!=='POST') return json({error:'method_not_allowed'},405);
            const who=await actor(deps);
            try{deps.verifyOrigin(request);}catch{return json({error:'invalid_origin'},403);}
            const action=url.searchParams.get('action');
            if(action==='start') {
                const raw=await request.text();
                if(raw.length>4096)return json({error:'too_large'},413);
                let body;try{body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
                if(!validId(body?.draftId)||!Number.isInteger(body.size)||body.size<12||body.size>MAX_AUDIO_SIZE)return json({error:'audio_size'},400);
                if(typeof body.name!=='string'||body.name.length>180)return json({error:'audio_type'},400);
                const draft=await store.get(`drafts/${body.draftId}.json`,{type:'json'});
                if(!owns(who,draft))return json({error:'not_found'},404);
                const id=randomUUID();
                const asset={id,draftId:draft.id,ownerId:draft.ownerId,name:body.name,size:body.size,parts:Math.ceil(body.size/CHUNK_SIZE),complete:false,createdAt:new Date().toISOString()};
                const result=await store.setJSON(audioKey(id),asset,{onlyIfNew:true});
                if(!result.modified)return json({error:'conflict'},409);
                return json({id,chunkSize:CHUNK_SIZE},201);
            }
            const id=url.searchParams.get('id');
            if(!validId(id))return json({error:'not_found'},404);
            const saved=await store.getWithMetadata(audioKey(id),{type:'json'});
            if(!saved)return json({error:'not_found'},404);
            const asset=saved.data;
            const draft=await store.get(`drafts/${asset.draftId}.json`,{type:'json'});
            if(!owns(who,draft) || draft.retiredAudio?.includes(id))return json({error:'not_found'},404);
            if(action==='complete' && asset.complete)return json({asset:{id,name:asset.name,size:asset.size}});
            if(asset.complete)return json({error:'conflict'},409);
            if(action==='chunk') {
                const rawPart=url.searchParams.get('part');
                const part=Number(rawPart);
                if(!/^\d+$/.test(rawPart||'')||!Number.isInteger(part)||part<0||part>=asset.parts)return json({error:'invalid_chunk'},400);
                const bytes=await request.arrayBuffer();
                const expected=Math.min(CHUNK_SIZE,asset.size-part*CHUNK_SIZE);
                if(bytes.byteLength!==expected)return json({error:'invalid_chunk'},400);
                const hash=digest(new Uint8Array(bytes));
                const result=await store.set(partKey(id,part),bytes,{onlyIfNew:true,metadata:{hash}});
                if(!result.modified) {
                    const current=await store.getWithMetadata(partKey(id,part),{type:'arrayBuffer'});
                    if(current?.metadata?.hash!==hash)return json({error:'conflict'},409);
                }
                // A deletion/cleanup may have won while this chunk was being written.
                const currentDraft=await store.get(`drafts/${asset.draftId}.json`,{type:'json'});
                if(!owns(who,currentDraft) || currentDraft.retiredAudio?.includes(id)) {
                    await store.delete(partKey(id,part));
                    return json({error:'not_found'},404);
                }
                return json({ok:true});
            }
            if(action==='complete') {
                for(let part=0;part<asset.parts;part++) {
                    const bytes=await store.get(partKey(id,part),{type:'arrayBuffer'});
                    if(!bytes||bytes.byteLength!==Math.min(CHUNK_SIZE,asset.size-part*CHUNK_SIZE))return json({error:'incomplete_audio'},400);
                    if(part===0)asset.mime=audioMime(Buffer.from(bytes));
                }
                if(!asset.mime)return json({error:'audio_type'},400);
                if(!saved.etag)return json({error:'service_unavailable'},503);
                const result=await store.setJSON(audioKey(id),{...asset,complete:true},{onlyIfMatch:saved.etag});
                if(!result.modified)return json({error:'conflict'},409);
                return json({asset:{id,name:asset.name,size:asset.size}});
            }
            return json({error:'invalid_action'},400);
        }catch(error){
            if(error.status)return json({error:error.message},error.status);
            console.error('[Publisher audio]',error);
            return json({error:'service_unavailable'},503);
        }
    };
}
