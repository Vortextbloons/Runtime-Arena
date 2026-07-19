import json,sys,time,multiprocessing as mp

MASK32=0xffffffff
MASK64=0xffffffffffffffff

def mix32(x):
    x=(x^(x>>16))&MASK32; x=(x*0x21f0aaad)&MASK32; x=(x^(x>>15))&MASK32; x=(x*0x735a2d97)&MASK32; x=(x^(x>>15))&MASK32; return x

def rotate_left64(x,n):
    return ((x<<n)|(x>>(64-n)))&MASK64

def worker(wid,items_per_worker,rounds_per_item,work_q,result_q):
    while True:
        item=work_q.get()
        if item is None: break
        phase_seed=item; lx=0; ls=0
        for li in range(items_per_worker):
            gid=(wid*items_per_worker+li)&MASK32
            x=(phase_seed^gid^((wid*0x9e3779b9)&MASK32))&MASK32
            for _ in range(rounds_per_item):
                x=(x^(x<<13))&MASK32; x=(x^(x>>17))&MASK32; x=(x^(x<<5))&MASK32; x=(x*0x9e3779b1+0x85ebca77)&MASK32
            lx^=x; ls=(ls+x)&MASK64
        result_q.put((wid,lx,ls))

def main():
    def arg(name): return sys.argv[sys.argv.index(name)+1]
    with open(arg("--input")) as f: data=json.load(f)
    wc=data["workerCount"]; pc=data["phaseCount"]; iwp=data["itemsPerWorker"]; rpi=data["roundsPerItem"]
    work_q=mp.Queue(); result_q=mp.Queue(); procs=[]
    for w in range(wc):
        p=mp.Process(target=worker,args=(w,iwp,rpi,work_q,result_q))
        procs.append(p); p.start()
    def kernel():
        ps=int(data["initialSeed"],16); d=0x6a09e667f3bcc909
        for phase in range(pc):
            for _ in range(wc): work_q.put(ps)
            results=[result_q.get() for _ in range(wc)]
            results.sort(key=lambda r:r[0])
            ns=(ps^phase)&MASK32; psum=0
            for wid,lx,ls in results:
                ns=mix32(ns^lx^(ls&MASK32)^((ls>>32)&MASK32)^wid)
                psum=(psum+ls)&MASK64
            ps=ns; d=rotate_left64(d,7); d^=ns; d=(d+psum)&MASK64
        return {"schemaVersion":"1.0.0","benchmark":"barrier-wave","workerCount":wc,"phaseCount":pc,"itemsProcessed":wc*pc*iwp,"finalSeed":f"{ps:08x}","digest":f"{d:016x}"}
    samples=[]; output=None
    for i in range(-int(arg("--warmup")),int(arg("--iterations"))):
        start=time.perf_counter_ns(); output=kernel(); elapsed=time.perf_counter_ns()-start
        if i>=0: samples.append({"iteration":i+1,"kernelTimeNanoseconds":max(1,elapsed)})
    for _ in range(wc): work_q.put(None)
    for p in procs: p.join()
    with open(arg("--output"),"w") as f: json.dump(output,f)
    with open(arg("--timing-output"),"w") as f: json.dump({"samples":samples},f,separators=(",",":"))

if __name__=="__main__": main()
