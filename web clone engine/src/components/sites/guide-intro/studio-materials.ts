import inscription from "./engraving-paths.json";

interface StudioMaterials { frame: string; signature: string }
let prepared: Promise<StudioMaterials> | undefined;
function canvas(width: number, height: number) {
  const element = document.createElement("canvas"); element.width = width; element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("The studio materials could not be prepared.");
  return {element,context};
}
async function photograph(src: string) {
  const image = new Image(); image.src = src; await image.decode(); return image;
}
function table(stops: number[]) {
  return Uint8ClampedArray.from({length:256},(_,i)=>{
    const at=i/255*(stops.length-1),a=Math.floor(at),b=Math.min(stops.length-1,a+1);
    return (stops[a]+(stops[b]-stops[a])*(at-a))*255;
  });
}

/** Bake only static shading before the intro clock starts; original photographs stay unchanged. */
export function prepareStudioMaterials() {
  prepared ??= Promise.all([
    photograph("/sites/guide-intro/cassetta-frame-met.jpg"),
    photograph("/sites/guide-intro/engraving-plaster.jpg"),
  ]).then(([framePhoto,plaster])=>{
    const frame=canvas(2000,1600),ctx=frame.context;
    const columns=[[32,192,0,38],[224,960,38,924],[1184,198,962,38]];
    const rows=[[94,188,0,38],[282,1313,38,724],[1595,197,762,38]];
    for(const [row,[sy,sh,y,h]]of rows.entries())for(const [col,[sx,sw,x,w]]of columns.entries()){
      if(row===1&&col===1)continue;
      ctx.drawImage(framePhoto,sx,sy,sw,sh,x*2,y*2,w*2,h*2);
    }
    const pixels=ctx.getImageData(0,0,2000,1600),d=pixels.data;
    const red=table([.12,.39,.67,.86,.97]),green=table([.08,.25,.46,.68,.85]),blue=table([.035,.10,.22,.40,.64]);
    for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;d[i]=red[d[i]];d[i+1]=green[d[i+1]];d[i+2]=blue[d[i+2]];}
    ctx.putImageData(pixels,0,0);

    const grain=canvas(720,720);grain.context.drawImage(plaster,0,0,720,720);
    const photographPixels=grain.context.getImageData(0,0,720,720),g=photographPixels.data;
    for(let i=0;i<g.length;i+=4){const value=(g[i]*.2126+g[i+1]*.7152+g[i+2]*.0722)*1.1-255*.24;g[i]=g[i+1]=g[i+2]=value;}
    grain.context.putImageData(photographPixels,0,0);
    const signature=canvas(1440,192),cut=signature.context;
    cut.scale(2,2);
    const pattern=cut.createPattern(grain.element,"repeat");
    if(!pattern)throw new Error("The engraved grain could not be prepared.");
    pattern.setTransform(new DOMMatrix().translate(0,-320));
    const letters=new Path2D(inscription.paths.map(letter=>letter.d).join(" "));
    cut.fillStyle=pattern;
    cut.shadowColor="#fff";cut.shadowOffsetY=1.2;cut.shadowBlur=.35;cut.fill(letters);
    cut.shadowColor="#27272b7a";cut.shadowOffsetY=-.75;cut.shadowBlur=.4;cut.fill(letters);
    const result={frame:frame.element.toDataURL("image/png"),signature:signature.element.toDataURL("image/png")};
    // Release the preparation buffers; only the two encoded static textures are retained.
    frame.element.width=grain.element.width=signature.element.width=1;
    return result;
  }).catch(error=>{prepared=undefined;throw error;});
  return prepared;
}
