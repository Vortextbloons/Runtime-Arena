import csv,json,sys,hashlib,time
def arg(name):return sys.argv[sys.argv.index(name)+1]
with open(arg("--input"),newline="") as f:
    reader=csv.reader(f);next(reader);rows=[(r[1],r[2],int(r[3]),int(r[4])) for r in reader if len(r)>=5]
def kernel():
    total_quantity=total_value=0;minimum=float("inf");maximum=0;categories={};accounts={}
    for account,category,quantity,price in rows:
        value=quantity*price;total_quantity+=quantity;total_value+=value;minimum=min(minimum,value);maximum=max(maximum,value)
        entry=categories.setdefault(category,{"quantity":0,"valueMinorUnits":0});entry["quantity"]+=quantity;entry["valueMinorUnits"]+=value;accounts[account]=accounts.get(account,0)+value
    category_list=[{"category":k,**v} for k,v in sorted(categories.items())];top=[{"accountId":k,"valueMinorUnits":v} for k,v in sorted(accounts.items(),key=lambda x:(-x[1],x[0]))[:10]]
    checksum=hashlib.sha256((json.dumps({"Categories":category_list,"TopAccounts":top},separators=(",",":"))+"\n").encode()).hexdigest()
    return{"benchmark":"aggregation","version":1,"recordCount":len(rows),"totalQuantity":total_quantity,"totalValueMinorUnits":total_value,"categories":category_list,"topAccounts":top,"minimumTransactionMinorUnits":minimum,"maximumTransactionMinorUnits":maximum,"checksum":checksum}
samples=[];output=None
for i in range(-int(arg("--warmup")),int(arg("--iterations"))):
    start=time.perf_counter_ns();output=kernel();elapsed=time.perf_counter_ns()-start
    if i>=0:samples.append({"iteration":i+1,"kernelTimeNanoseconds":elapsed})
with open(arg("--output"),"w") as f:json.dump(output,f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
