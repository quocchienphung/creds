import icons from "./icons.json";

/** Only static SVGs captured from the public preview. */
export function RunIcon({name,size}:{name:string;size?:number}){
  const svg=(icons as Record<string,string>)[name];
  return svg ? <span className="crm-icon" style={size ? {width:size,height:size} : undefined} aria-hidden="true" dangerouslySetInnerHTML={{__html:svg}} /> : null;
}
