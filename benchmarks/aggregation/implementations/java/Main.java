import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

public final class Main {
  static final class Category { String name; long quantity, value; Category(String n) { name=n; } }
  static final class Account { String id; long value; Account(String i, long v) { id=i; value=v; } }
  static final class Result {
    long count, quantity, value, min=Long.MAX_VALUE, max;
    ArrayList<Category> categories; ArrayList<Account> accounts; String checksum;
  }

  static ArrayList<String> csv(String line) {
    ArrayList<String> out=new ArrayList<>(); StringBuilder b=new StringBuilder(); boolean quoted=false;
    for (int i=0;i<line.length();i++) { char c=line.charAt(i);
      if (c=='"') { if (quoted && i+1<line.length() && line.charAt(i+1)=='"') { b.append('"'); i++; } else quoted=!quoted; }
      else if (c==',' && !quoted) { out.add(b.toString()); b.setLength(0); } else b.append(c);
    }
    out.add(b.toString()); return out;
  }
  static ArrayList<String[]> readRows(String path) throws IOException {
    ArrayList<String[]> rows=new ArrayList<>();
    try (BufferedReader r=Files.newBufferedReader(Path.of(path), StandardCharsets.UTF_8)) {
      r.readLine(); String line; while ((line=r.readLine())!=null) { ArrayList<String> f=csv(line); if (f.size()>=5) rows.add(f.toArray(new String[0])); }
    }
    return rows;
  }
  static String esc(String s) { StringBuilder b=new StringBuilder("\""); for (int i=0;i<s.length();i++) { char c=s.charAt(i); if(c=='"')b.append("\\\""); else if(c=='\\')b.append("\\\\"); else if(c=='\n')b.append("\\n"); else if(c=='\r')b.append("\\r"); else if(c=='\t')b.append("\\t"); else b.append(c); } return b.append('"').toString(); }
  static String categoriesJson(List<Category> cs) { StringBuilder b=new StringBuilder("["); for(int i=0;i<cs.size();i++){if(i>0)b.append(','); Category c=cs.get(i); b.append("{\"category\":").append(esc(c.name)).append(",\"quantity\":").append(c.quantity).append(",\"valueMinorUnits\":").append(c.value).append('}');} return b.append(']').toString(); }
  static String accountsJson(List<Account> as) { StringBuilder b=new StringBuilder("["); for(int i=0;i<as.size();i++){if(i>0)b.append(','); Account a=as.get(i); b.append("{\"accountId\":").append(esc(a.id)).append(",\"valueMinorUnits\":").append(a.value).append('}');} return b.append(']').toString(); }
  static Result kernel(ArrayList<String[]> rows) throws Exception {
    HashMap<String,Category> cm=new HashMap<>(); HashMap<String,Long> am=new HashMap<>(); Result r=new Result();
    for(String[] x:rows){ long q=Long.parseLong(x[3]), p=Long.parseLong(x[4]), v=q*p; r.count++; r.quantity+=q; r.value+=v; r.min=Math.min(r.min,v); r.max=Math.max(r.max,v); Category c=cm.computeIfAbsent(x[2],Category::new); c.quantity+=q;c.value+=v; am.put(x[1],am.getOrDefault(x[1],0L)+v); }
    r.categories=new ArrayList<>(cm.values()); r.categories.sort(Comparator.comparing((Category c)->c.name));
    r.accounts=new ArrayList<>(); for(Map.Entry<String,Long> e:am.entrySet())r.accounts.add(new Account(e.getKey(),e.getValue()));
    r.accounts.sort((a,b)->a.value!=b.value?Long.compare(b.value,a.value):a.id.compareTo(b.id)); if(r.accounts.size()>10)r.accounts.subList(10,r.accounts.size()).clear();
    String check="{\"Categories\":"+categoriesJson(r.categories)+",\"TopAccounts\":"+accountsJson(r.accounts)+"}\n";
    byte[] digest=MessageDigest.getInstance("SHA-256").digest(check.getBytes(StandardCharsets.UTF_8)); StringBuilder h=new StringBuilder(); for(byte z:digest)h.append(String.format("%02x",z&255)); r.checksum=h.toString(); return r;
  }
  static String output(Result r) { return "{\"benchmark\":\"aggregation\",\"version\":1,\"recordCount\":"+r.count+",\"totalQuantity\":"+r.quantity+",\"totalValueMinorUnits\":"+r.value+",\"categories\":"+categoriesJson(r.categories)+",\"topAccounts\":"+accountsJson(r.accounts)+",\"minimumTransactionMinorUnits\":"+r.min+",\"maximumTransactionMinorUnits\":"+r.max+",\"checksum\":\""+r.checksum+"\"}"; }
  static String arg(String[] a,String n,String d){for(int i=0;i+1<a.length;i++)if(a[i].equals(n))return a[i+1];return d;}
  public static void main(String[] args) throws Exception {
    String input=arg(args,"--input",null), output=arg(args,"--output",null), timing=arg(args,"--timing-output",null); int warm=Integer.parseInt(arg(args,"--warmup","0")), it=Integer.parseInt(arg(args,"--iterations","1"));
    if(input==null||output==null||timing==null)throw new IllegalArgumentException("missing required arguments"); ArrayList<String[]> rows=readRows(input); Result last=null; StringBuilder samples=new StringBuilder("{\"samples\":[");
    int measured=0; for(int i=-warm;i<it;i++){long start=System.nanoTime(); last=kernel(rows); long elapsed=Math.max(1,System.nanoTime()-start); if(i>=0){if(measured++>0)samples.append(','); samples.append("{\"iteration\":").append(i+1).append(",\"kernelTimeNanoseconds\":").append(elapsed).append('}');}}
    samples.append("]}"); Files.writeString(Path.of(output),output(last),StandardCharsets.UTF_8); Files.writeString(Path.of(timing),samples.toString(),StandardCharsets.UTF_8);
  }
}
