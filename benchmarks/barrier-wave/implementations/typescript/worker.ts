import{parentPort}from"node:worker_threads";
let wId=0,ipw=0,rpi=0;
parentPort!.on("message",(msg:any)=>{
  if(msg.cmd==="init"){wId=msg.workerId;ipw=msg.itemsPerWorker;rpi=msg.roundsPerItem}
  else if(msg.cmd==="work"){
    const{phaseSeed}=msg;let lx=0;let ls=0n;
    for(let it=0;it<ipw;it++){const gid=(wId*ipw+it)>>>0;let x=(phaseSeed^gid^Math.imul(wId,0x9e3779b9)>>>0)>>>0;for(let r=0;r<rpi;r++){x=(x^(x<<13))>>>0;x=(x^(x>>>17))>>>0;x=(x^(x<<5))>>>0;x=(Math.imul(x,0x9e3779b1)+0x85ebca77)>>>0}lx^=x;ls=BigInt.asUintN(64,ls+BigInt(x))}
    parentPort!.postMessage({workerId:wId,localXor:lx,localSum:ls.toString()})
  }
});
