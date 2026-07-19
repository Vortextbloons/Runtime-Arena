import csv,json,sys,hashlib,time
from collections import defaultdict
def arg(name):return sys.argv[sys.argv.index(name)+1]
min_it = int(arg("--min-iterations"))
max_it = int(arg("--max-iterations"))
target_ci = float(arg("--target-relative-ci"))
_T=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045]
def _ci_w(samples):
    n=len(samples)
    if n<2: return float("inf")
    mean=sum(samples)/n
    if mean<=0: return float("inf")
    var=sum((x-mean)**2 for x in samples)/(n-1)
    t=_T[n] if n<len(_T) else 2
    return 2*t*(var/n)**0.5/mean
with open(arg("--input"),newline="") as f:
    reader=csv.reader(f);next(reader);rows=[(r[1],r[2],int(r[3]),int(r[4])) for r in reader if len(r)>=5]
def kernel():
    total_quantity=total_value=0;minimum=float("inf");maximum=0
    categories=defaultdict(lambda:[0,0]);accounts=defaultdict(int)
    for account,category,quantity,price in rows:
        value=quantity*price;total_quantity+=quantity;total_value+=value
        if value<minimum:minimum=value
        if value>maximum:maximum=value
        e=categories[category];e[0]+=quantity;e[1]+=value
        accounts[account]+=value
    category_list=[{"category":k,"quantity":v[0],"valueMinorUnits":v[1]} for k,v in sorted(categories.items())]
    top=sorted(accounts.items(),key=lambda x:(-x[1],x[0]))[:10]
    top_accounts=[{"accountId":k,"valueMinorUnits":v} for k,v in top]
    checksum=hashlib.sha256((json.dumps({"Categories":category_list,"TopAccounts":top_accounts},separators=(",",":"))+"\n").encode()).hexdigest()
    return{"benchmark":"aggregation","version":1,"recordCount":len(rows),"totalQuantity":total_quantity,"totalValueMinorUnits":total_value,"categories":category_list,"topAccounts":top_accounts,"minimumTransactionMinorUnits":int(minimum),"maximumTransactionMinorUnits":maximum,"checksum":checksum}
samples=[];output=None
times = []
for i in range(-int(arg("--warmup")), 10**9):
    start=time.perf_counter_ns();output=kernel();elapsed=time.perf_counter_ns()-start
    if i>=0:
        times.append(elapsed)
        samples.append({"iteration":len(samples)+1,"kernelTimeNanoseconds":elapsed})
        if len(times)>=max_it or (len(times)>=min_it and _ci_w(times)<=target_ci): break
with open(arg("--output"),"w") as f:json.dump(output,f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
