import {describe,expect,it} from 'vitest';
import {classifyNativeBlank,nativeControlMaxRowRuns} from './helpers/nativeBlankSurface.js';
function frame(width:number,height:number,w=width,h=height):Uint8Array{
 const rgb=new Uint8Array(width*height*3);rgb.fill(127);for(let y=0;y<h;y++)for(let x=0;x<w;x++)rgb.fill(255,(y*width+x)*3,(y*width+x+1)*3);return rgb;
}
function pixel(rgb:Uint8Array,width:number,x:number,y:number,values:readonly[number,number,number]):void{rgb.set(values,(y*width+x)*3);}
describe('exact native blank surface (dated padding ruling, no pixel exemptions)',()=>{
 it('accepts unchanged whole-white criterion including channel245 and a one-pixel canvas',()=>{for(const [w,h] of [[8,5],[1,1]]){const rgb=frame(w??0,h??0);rgb.fill(245);expect(classifyNativeBlank(rgb,w??0,h??0)).toMatchObject({accepted:true,kind:'WHITE',padPixels:0,padMin:null,padMax:null});}});
 it.each([[640,360,456,257],[11,7,5,3],[7,5,7,2],[7,5,3,5]])('accepts only exact anchored rectangle geometry %s x %s with content %s x %s',(width,height,w,h)=>{expect(classifyNativeBlank(frame(width,height,w,h),width,height)).toEqual({accepted:true,kind:'WHITE_WITH_NATIVE_PAD',rectangle:[0,0,w,h],padPixels:width*height-w*h,padMin:127,padMax:127});});
 it('accepts only the specified per-pixel codec gray range/spread',()=>{const rgb=frame(4,3,2,2);pixel(rgb,4,3,0,[126,127,127]);pixel(rgb,4,3,1,[128,129,129]);expect(classifyNativeBlank(rgb,4,3)).toMatchObject({accepted:true,padMin:126,padMax:129});});
 it.each([[125,125,125],[130,130,130],[126,128,127],[0,0,0],[255,0,0],[245,245,245]] as const)('rejects bad pad color %s,%s,%s',(r,g,b)=>{const rgb=frame(8,5,4,3);pixel(rgb,8,7,4,[r,g,b]);expect(classifyNativeBlank(rgb,8,5).accepted).toBe(false);});
 it.each([[1,1],[3,2],[0,0],[3,0],[0,2]])('rejects a single text/black pixel in content at %s,%s',(x,y)=>{const rgb=frame(8,5,4,3);pixel(rgb,8,x,y,[0,0,0]);expect(classifyNativeBlank(rgb,8,5).accepted).toBe(false);});
 it('rejects nonrectangles, content holes, offset rectangles, allgray and unclassified seams',()=>{
 const hole=frame(8,5,4,3);pixel(hole,8,1,1,[127,127,127]);
 const extra=frame(8,5,4,3);pixel(extra,8,5,2,[255,255,255]);
 const offset=frame(8,5,0,0);for(let y=1;y<4;y++)for(let x=1;x<5;x++)pixel(offset,8,x,y,[255,255,255]);
 const seam=frame(8,5,4,3);pixel(seam,8,4,1,[200,200,200]);
 for(const rgb of [hole,extra,offset,frame(8,5,0,0),seam])expect(classifyNativeBlank(rgb,8,5).accepted).toBe(false);
 });
 it.each([[0,2],[2,0],[-1,2],[1.5,2],[NaN,2],[Infinity,2],[Number.MAX_SAFE_INTEGER,2]])('rejects malformed dimensions %s,%s',(w,h)=>{expect(classifyNativeBlank(new Uint8Array(),w,h).accepted).toBe(false);});
 it('rejects empty,truncated,extra-byte and oversized buffers',()=>{for(const rgb of [new Uint8Array(),new Uint8Array(11),new Uint8Array(13)])expect(classifyNativeBlank(rgb,2,2).accepted).toBe(false);expect(classifyNativeBlank(new Uint8Array(),10000,10000).accepted).toBe(false);});
});

it('probe control complexity cannot be supplied by white/black/gray surfaces or padding edges',()=>{
 const white=frame(16,8),pad=frame(16,8,9,4),gray=frame(16,8,0,0),black=frame(16,8);black.fill(17);
 for(const rgb of [white,pad,gray,black])expect(nativeControlMaxRowRuns(rgb,16)).toBeLessThanOrEqual(6);
 const text=frame(16,8);for(let x=1;x<16;x+=2)pixel(text,16,x,3,[0,0,0]);expect(classifyNativeBlank(text,16,8).accepted).toBe(false);expect(nativeControlMaxRowRuns(text,16)).toBeGreaterThan(6);
});
