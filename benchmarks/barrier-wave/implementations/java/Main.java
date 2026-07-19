import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.*;
import java.util.regex.*;

public final class Main {
  static final int MUL=0x9e3779b9, ROUND_MUL=0x9e3779b1, ADD=0x85ebca77; static final long INITIAL=0x6a09e667f3bcc909L;
  static final class Input { int workers, phases, items, rounds; long seed; }
  static final class Pool {
    static final Object STOP=new Object(); final ArrayBlockingQueue<Object>[] inbox; final int[] xors; final long[] sums; final Thread[] threads; final CyclicBarrier dispatch, complete; final int workers, items, rounds;
    @SuppressWarnings("unchecked") Pool(int w,int i,int r) throws Exception { workers=w;items=i;rounds=r; inbox=(ArrayBlockingQueue<Object>[])new ArrayBlockingQueue<?>[w]; xors=new int[w];sums=new long[w];threads=new Thread[w];dispatch=new CyclicBarrier(w+1);complete=new CyclicBarrier(w+1);
      for(int id=0;id<w;id++){inbox[id]=new ArrayBlockingQueue<>(1); final int worker=id; threads[id]=new Thread(()->run(worker),"barrier-wave-"+id); threads[id].start();}
    }
    void run(int id){try{while(true){dispatch.await(); Object message=inbox[id].take(); if(message==STOP)return; int seed=(Integer)message; int xor=0; long sum=0; int wm=id*MUL;
        for(int j=0;j<items;j++){int x=seed^(id*items+j)^wm;for(int k=0;k<rounds;k++){x^=x<<13;x^=x>>>17;x^=x<<5;x=x*ROUND_MUL+ADD;}xor^=x;sum+=Integer.toUnsignedLong(x);}xors[id]=xor;sums[id]=sum;complete.await();}}
      catch(Exception e){throw new RuntimeException(e);}}
    void close() throws Exception {for(ArrayBlockingQueue<Object> q:inbox)q.put(STOP);dispatch.await();for(Thread t:threads)t.join();}
  }
  static int mix(int x){x^=x>>>16;x*=0x21f0aaad;x^=x>>>15;x*=0x735a2d97;x^=x>>>15;return x;}
  static long rot(long x){return (x<<7)|(x>>>57);}
  static long number(String raw,String key){Matcher m=Pattern.compile("\\\""+key+"\\\"\\s*:\\s*(?:\\\"([0-9a-fA-F]+)\\\"|([0-9]+))").matcher(raw);if(!m.find())throw new IllegalArgumentException("missing "+key);return Long.parseLong(m.group(1)!=null?m.group(1):m.group(2),key.equals("initialSeed")?16:10);}
  static Input read(String path)throws IOException{String s=Files.readString(Path.of(path));Input x=new Input();x.workers=(int)number(s,"workerCount");x.phases=(int)number(s,"phaseCount");x.items=(int)number(s,"itemsPerWorker");x.rounds=(int)number(s,"roundsPerItem");x.seed=number(s,"initialSeed");return x;}
  static String[] kernel(Input in,Pool p){int seed=(int)in.seed;long digest=INITIAL;for(int phase=0;phase<in.phases;phase++){for(int w=0;w<in.workers;w++)try{p.inbox[w].put(seed);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new RuntimeException(e);}try{p.dispatch.await();p.complete.await();}catch(Exception e){throw new RuntimeException(e);}int next=seed^phase;long sum=0;for(int w=0;w<in.workers;w++){next=mix(next^p.xors[w]^(int)p.sums[w]^(int)(p.sums[w]>>>32)^w);sum+=p.sums[w];}seed=next;digest=rot(digest)^Integer.toUnsignedLong(seed);digest+=sum;}return new String[]{String.format(java.util.Locale.ROOT,"%08x",seed),String.format(java.util.Locale.ROOT,"%016x",digest)};}
  static String arg(String[] a,String n,String d){for(int i=0;i+1<a.length;i++)if(a[i].equals(n))return a[i+1];return d;}
  public static void main(String[] a)throws Exception{Input in=read(arg(a,"--input",null));String out=arg(a,"--output",null),timing=arg(a,"--timing-output",null);int warm=Integer.parseInt(arg(a,"--warmup","0")),it=Integer.parseInt(arg(a,"--iterations","1"));Pool p=new Pool(in.workers,in.items,in.rounds);String[] result=null;StringBuilder samples=new StringBuilder("{\"samples\":[");int measured=0;try{for(int n=-warm;n<it;n++){long st=System.nanoTime();result=kernel(in,p);long elapsed=Math.max(1,System.nanoTime()-st);if(n>=0){if(measured++>0)samples.append(',');samples.append("{\"iteration\":").append(n+1).append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');}}}finally{p.close();}samples.append("]}");String json="{\"schemaVersion\":\"1.0.0\",\"benchmark\":\"barrier-wave\",\"workerCount\":"+in.workers+",\"phaseCount\":"+in.phases+",\"itemsProcessed\":"+(long)in.workers*in.phases*in.items+",\"finalSeed\":\""+result[0]+"\",\"digest\":\""+result[1]+"\"}";Files.writeString(Path.of(out),json,StandardCharsets.UTF_8);Files.writeString(Path.of(timing),samples.toString(),StandardCharsets.UTF_8);}
}
