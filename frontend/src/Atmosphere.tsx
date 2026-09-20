import {useEffect,useRef,useState} from "react";

/** Original vector artwork: decorative only, never involved in contract state. */
export function Atmosphere(){
  const host=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    const element=host.current;
    if(!element||typeof IntersectionObserver==="undefined")return;
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting));
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  return <div ref={host} className={`vs-atmosphere ${!visible?"is-paused":""}`}>
    <div className="atmosphere-art" aria-hidden="true">
      <div className="pearl-orbit"/><div className="pearl-orbit orbit-inner"/>
      {[0,1,2,3,4].map(index=><div key={index} className={`butterfly flight-${index}`}>
        <svg viewBox="0 0 120 100" focusable="false">
          <defs><linearGradient id={`wing-${index}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff1dc"/><stop offset=".4" stopColor="#e2b4ef"/><stop offset=".72" stopColor="#9572de"/><stop offset="1" stopColor="#ef99af"/></linearGradient></defs>
          <g fill={`url(#wing-${index})`} stroke="#fbe6f4" strokeWidth=".65">
            <g className="wing wing-left"><path d="M59 51C42 13 9 1 7 21C4 42 30 54 50 57C15 50 19 91 37 84C51 79 56 64 59 51Z"/><path className="wing-veins" d="M57 51L14 22M55 53L15 36M54 59L31 78"/></g>
            <g className="wing wing-right"><path d="M61 51C78 13 111 1 113 21C116 42 90 54 70 57C105 50 101 91 83 84C69 79 64 64 61 51Z"/><path className="wing-veins" d="M63 51L106 22M65 53L105 36M66 59L89 78"/></g>
          </g>
          <path d="M59 40Q60 32 54 29M61 40Q60 32 66 29" fill="none" stroke="#f3d5ed" strokeWidth="1"/>
          <ellipse cx="60" cy="52" rx="2" ry="15" fill="#eee0ee"/>
        </svg>
      </div>)}
    </div>
  </div>;
}
