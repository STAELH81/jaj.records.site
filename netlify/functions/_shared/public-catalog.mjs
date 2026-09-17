import { createHash } from 'node:crypto';
import { json, validId } from './publisher-media.mjs';

export function publicRelease(draft) {
    const release=draft.publication;
    const id=`release-${draft.id}`;
    const artistId=`artist-${createHash('sha256').update(`${draft.ownerId}:${release.artist.toLowerCase()}`).digest('hex').slice(0,20)}`;
    const year=Number((release.releaseDate||release.publishedAt).slice(0,4));
    return {
        artist:{id:artistId,name:release.artist,slug:artistId},
        release:{id,slug:id,artistId,title:release.title,type:release.type,year,releaseDate:release.releaseDate,
            label:'JAJ Records',status:'published',publishedAt:release.publishedAt,
            cover:release.cover?`/api/catalog-cover?id=${draft.id}&v=${release.revision}`:'',copyright:`© ${year} JAJ Records`,
            tracks:release.tracks.map((track,index)=>({id:`${id}-${index+1}`,number:index+1,title:track.title,availability:'full',
                audio:track.audioAssetId?`/api/artist-audio?id=${track.audioAssetId}`:track.audioUrl})),
        },
    };
}

export function createCatalogHandler(getStore) {
    return async(request,context)=>{
        try{
            if(request.method!=='GET')return json({error:'method_not_allowed'},405);
            const store=getStore(context);
            const url=new URL(request.url);
            if(url.pathname.endsWith('/catalog-cover')) {
                const id=url.searchParams.get('id');
                if(!validId(id))return json({error:'not_found'},404);
                const draft=await store.get(`drafts/${id}.json`,{type:'json'});
                const cover=draft?.publication?.cover;
                if(!cover)return json({error:'not_found'},404);
                const match=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(cover);
                if(!match)return json({error:'not_found'},404);
                return new Response(Buffer.from(match[2],'base64'),{headers:{'Content-Type':match[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
            }
            const {blobs}=await store.list({prefix:'drafts/'});
            const releases=[],artists=new Map();
            for(const item of blobs) {
                const draft=await store.get(item.key,{type:'json'});
                if(!draft?.publication)continue;
                const value=publicRelease(draft);
                artists.set(value.artist.id,value.artist);
                releases.push(value.release);
            }
            releases.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
            return json({artists:[...artists.values()],releases});
        }catch(error){console.error('[Public catalog]',error);return json({error:'service_unavailable'},503);}
    };
}
